//! Local, opt-in, *synthetic-only* vault commands.
//! NOT a production case store: no SQLCipher, OS key sealing, user sessions,
//! role grants, immutable audit, or safe PHI handling in the current webview.
//! Secrets arrive through Tauri IPC and may exist transiently in JS memory.
use serde::{Deserialize, Serialize};
use soar_storage::sealed_vault::{
    authenticate_backup, open_practitioner, recover_and_rekey, seal_local_case,
    encrypted_file_is_synthetic, unlock_for_autosave, reencrypt_document_for_recovery,
    UnlockedSession, MAX_ENVELOPE_BYTES, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_ENVELOPE_BYTES,
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;


/** IPC-only account gate. Native vault unit tests exercise lower-level crypto
 * directly, while every shipped Tauri command requires a signed-in operator. */
fn enforce_operator()->Result<(),String>{
    #[cfg(not(test))]
    { crate::operator_auth::require_operator() }
    #[cfg(test)]
    { Ok(()) }
}
struct ActiveVault {
    path: PathBuf,
    expected_cipher_hash: Vec<u8>,
    session: UnlockedSession,
    synthetic_only: bool,
}
static AUTOSAVE: OnceLock<Mutex<Option<ActiveVault>>> = OnceLock::new();
fn active() -> &'static Mutex<Option<ActiveVault>> {
    AUTOSAVE.get_or_init(|| Mutex::new(None))
}
fn begin_autosave(path: &str, ciphertext: &[u8], passphrase: &str) -> Result<(), String> {
    if Path::new(path).extension().and_then(|v| v.to_str()) != Some("soarvault") {
        let mut guard = active().lock().map_err(|_| "Vault lock unavailable.")?;
        *guard = None;
        return Ok(());
    }
    let (_, session) = error_message(unlock_for_autosave(ciphertext, passphrase))?;
    let mut guard = active().lock().map_err(|_| "Vault lock unavailable.")?;
    *guard = Some(ActiveVault {
        path: PathBuf::from(path),
        expected_cipher_hash: Sha256::digest(ciphertext).to_vec(),
        session,
        synthetic_only:error_message(encrypted_file_is_synthetic(ciphertext))?,
    });
    Ok(())
}
/// Atomic ciphertext replacement; no plaintext written to disk. Retains the
/// previous valid encrypted snapshot separately, to recover from interrupted
/// writes. Any external edit detected by ciphertext digest halts autosave.
fn atomic_ciphertext_replace(path: &Path, data: &[u8], expected_hash: &[u8]) -> Result<(), String> {
    if path.extension().and_then(|e| e.to_str()) != Some("soarvault") {
        return Err("Autosave only supports an unlocked .soarvault.".into());
    }
    let old_meta = fs::symlink_metadata(path).map_err(|_| "Vault disappeared; autosave stopped.".to_string())?;
    if !old_meta.file_type().is_file() || old_meta.len() as usize > MAX_ENVELOPE_BYTES {
        return Err("Vault is not a regular bounded file; autosave refused.".into());
    }
    let previous = fs::read(path).map_err(|_| "Cannot reread encrypted vault before autosave.".to_string())?;
    if Sha256::digest(&previous).as_slice() != expected_hash {
        return Err("Vault changed outside SOAR Desk. Autosave is paused to prevent lost updates.".into());
    }
    let dir = path.parent().ok_or("Invalid vault folder.")?;
    let mut tmp = tempfile::Builder::new()
        .prefix(".soar-ciphertext-")
        .suffix(".tmp")
        .tempfile_in(dir).map_err(|_| "Cannot create encrypted autosave temp file.".to_string())?;
    tmp.write_all(data).and_then(|_| tmp.as_file().sync_all())
        .map_err(|_| "Cannot write and sync encrypted autosave file.".to_string())?;
    // Retain one encrypted previous version. It is NOT a complete disaster
    // recovery backup; use the explicit .soarbackup export for that.
    let mut old_tmp = tempfile::Builder::new()
        .prefix(".soar-previous-")
        .tempfile_in(dir).map_err(|_| "Cannot create encrypted previous-version file.".to_string())?;
    old_tmp.write_all(&previous).and_then(|_| old_tmp.as_file().sync_all())
        .map_err(|_| "Cannot sync the previous encrypted version.".to_string())?;
    let mut previous_os = path.as_os_str().to_os_string();
    previous_os.push(".previous");
    let previous_path = PathBuf::from(previous_os);
    old_tmp.persist(&previous_path)
        .map_err(|_| "Cannot update encrypted previous version; autosave refused.".to_string())?;
    tmp.persist(path).map_err(|_| "Cannot replace encrypted vault atomically.".to_string())?;
    if let Ok(directory) = std::fs::File::open(dir) {
        let _ = directory.sync_all();
    }
    Ok(())
}

// Source documents are stored as separate authenticated ciphertext files.
// Filenames and the case-directory name contain only opaque IDs.
fn blob_folder(vault:&Path)->PathBuf{
    let mut name=vault.as_os_str().to_os_string();
    name.push(".blobs");
    PathBuf::from(name)
}
fn blob_path(vault:&Path,blob_id:&str)->Result<PathBuf,String>{
    if blob_id.len()!=32||!blob_id.bytes().all(|b|b.is_ascii_hexdigit()){
        return Err("Invalid encrypted evidence identifier.".into());
    }
    Ok(blob_folder(vault).join(format!("{blob_id}.soarblob")))
}
fn source_document(path:&str)->Result<Vec<u8>,String>{
    let input=Path::new(path);
    if !input.is_absolute(){return Err("Select an absolute local source file.".into())}
    let extension=input.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["pdf","png","jpeg","jpg","tif","tiff","txt"].contains(&extension.as_str()){
        return Err("Source must be a PDF, image, or text file.".into());
    }
    let meta=fs::symlink_metadata(input).map_err(|_|"Source file is inaccessible.".to_string())?;
    if !meta.file_type().is_file()||meta.len()==0||meta.len()>MAX_DOCUMENT_BYTES as u64{
        return Err("Source file must be a regular document under 20 MiB.".into());
    }
    let bytes=fs::read(input).map_err(|_|"Could not read the original source.".to_string())?;
    if bytes.len()>MAX_DOCUMENT_BYTES{return Err("Document exceeds encrypted attachment limit.".into())}
    Ok(bytes)
}

/* Verify a source against its claimed SHA-256, size, and case-authenticated
 * ciphertext. Never trust the unencrypted register metadata by itself. */
fn verified_blob(
    vault:&Path,session:&UnlockedSession,id:&str,sha256:&str,expected_bytes:u64
)->Result<(),String>{
    if sha256.len()!=64 || !sha256.bytes().all(|c|c.is_ascii_hexdigit()) {
        return Err("Encrypted evidence metadata has an invalid SHA-256.".into());
    }
    let path=blob_path(vault,id)?;
    let meta=fs::symlink_metadata(&path)
        .map_err(|_|"Referenced encrypted evidence is missing; backup refused.".to_string())?;
    if !meta.file_type().is_file() || meta.len()==0 ||
        meta.len()>MAX_DOCUMENT_ENVELOPE_BYTES as u64 {
        return Err("Referenced encrypted evidence is not a bounded regular file.".into());
    }
    let bytes=fs::read(&path).map_err(|_|"Cannot read referenced encrypted evidence.".to_string())?;
    let decrypted=error_message(session.decrypt_document(&bytes,id))?;
    if decrypted.len() as u64 != expected_bytes ||
       format!("{:x}",Sha256::digest(&*decrypted)) != sha256.to_ascii_lowercase() {
        return Err("Referenced evidence content differs from its saved size or SHA-256; backup refused.".into());
    }
    Ok(())
}

/* The encrypted snapshot is authoritative: verify all its registered originals
 * before making a backup. Orphan blobs are still copied for possible recovery
 * after an interrupted attachment, but never mistaken for indexed evidence. */
fn verify_snapshot_blobs(vault:&Path,sealed:&[u8],practitioner:&str)->Result<usize,String>{
    let (plaintext,session)=error_message(unlock_for_autosave(sealed,practitioner))?;
    let snapshot:serde_json::Value=serde_json::from_slice(&plaintext)
        .map_err(|_|"Cannot parse decrypted case for evidence verification.".to_string())?;
    let entries=snapshot.get("evidence").and_then(|v|v.as_array())
        .ok_or("Encrypted case is missing its evidence register.")?;
    let mut found=std::collections::HashSet::new();
    for entry in entries {
        let Some(id)=entry.get("blobId").and_then(|v|v.as_str()) else {continue};
        if !found.insert(id.to_string()) {
            return Err("Multiple evidence entries reference the same encrypted source ID.".into());
        }
        let sha=entry.get("sha256").and_then(|v|v.as_str())
            .ok_or("Attached source is missing its expected SHA-256.")?;
        let len=entry.get("bytes").and_then(|v|v.as_u64())
            .ok_or("Attached source is missing its expected byte count.")?;
        verified_blob(vault,&session,id,sha,len)?;
    }
    Ok(found.len())
}
#[derive(Deserialize)]
pub struct AttachEvidenceRequest{
    source_path:String,
    case_reference:String,
    #[serde(default)] expected_sha256:Option<String>,
    synthetic_confirmed:bool,
    #[serde(default)] local_risk_acknowledged:bool,
}
#[derive(Serialize)]
pub struct AttachedEvidence{
    pub blob_id:String,
    pub original_name:String,
    pub bytes:u64,
    pub sha256:String,
    pub encrypted_path:String,
}
#[tauri::command]
pub fn attach_evidence_document(request:AttachEvidenceRequest)->Result<AttachedEvidence,String>{
    enforce_operator()?;
    let guard=active().lock().map_err(|_|"Vault lock unavailable.")?;
    let active=guard.as_ref().ok_or("Create or unlock a writable encrypted vault before attaching records.")?;
    validate_local_ack(active.synthetic_only,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    if request.case_reference!=active.session.case_reference(){
        return Err("The source is not being attached to the currently unlocked case.".into());
    }
    let input=Zeroizing::new(source_document(&request.source_path)?);
    let digest=format!("{:x}",Sha256::digest(&*input));
    if let Some(expected)=&request.expected_sha256 {
        if expected!=&digest {
            return Err("The original document changed since OCR/analysis. Re-ingest it before attaching.".into());
        }
    }
    let (id,cipher)=error_message(active.session.encrypt_document(&input))?;
    let path=blob_path(&active.path,&id)?;
    let folder=blob_folder(&active.path);
    fs::create_dir_all(&folder).map_err(|_|"Cannot create encrypted evidence directory.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _=fs::set_permissions(&folder,fs::Permissions::from_mode(0o700));
    }
    let dest=new_encrypted_file(&path.display().to_string(),"soarblob",&cipher)?;
    let name=Path::new(&request.source_path).file_name().and_then(|v|v.to_str())
        .unwrap_or("source-document").to_string();
    Ok(AttachedEvidence{
        blob_id:id,original_name:name,bytes:input.len() as u64,
        sha256:digest,encrypted_path:dest
    })
}
#[derive(Deserialize)]
pub struct ExportEvidenceRequest{
    case_reference:String,
    blob_id:String,
    output_path:String,
    acknowledge_plaintext_export:bool,
}
#[tauri::command]
pub fn export_evidence_document(request:ExportEvidenceRequest)->Result<String,String>{
    enforce_operator()?;
    if !request.acknowledge_plaintext_export{
        return Err("Confirm that this export creates an UNENCRYPTED local copy.".into());
    }
    let guard=active().lock().map_err(|_|"Vault lock unavailable.")?;
    let active=guard.as_ref().ok_or("Unlock the original writable case vault first.")?;
    if request.case_reference!=active.session.case_reference(){
        return Err("Evidence does not belong to the currently unlocked case.".into());
    }
    let source=blob_path(&active.path,&request.blob_id)?;
    let metadata=fs::symlink_metadata(&source).map_err(|_|"Encrypted evidence file not found.".to_string())?;
    if !metadata.file_type().is_file()||metadata.len()>MAX_DOCUMENT_ENVELOPE_BYTES as u64{
        return Err("Encrypted evidence file invalid or oversized.".into());
    }
    let sealed=fs::read(&source).map_err(|_|"Cannot read encrypted evidence.".to_string())?;
    let plaintext=error_message(active.session.decrypt_document(&sealed,&request.blob_id))?;
    let output=Path::new(&request.output_path);
    if !output.is_absolute(){return Err("Choose an absolute destination.".into())}
    let ext=output.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["pdf","png","jpg","jpeg","tif","tiff","txt"].contains(&ext.as_str()){
        return Err("Export destination must have a supported document extension.".into());
    }
    new_encrypted_file(&request.output_path,&ext,&plaintext)
}


#[derive(Deserialize)]
pub struct VerifyEvidenceRequest {
    case_reference:String,
    blob_id:String,
    expected_sha256:String,
    expected_bytes:u64,
}
#[derive(Serialize)]
pub struct VerifiedEvidence {
    pub blob_id:String,
    pub authenticated:bool,
    pub sha256_matched:bool,
    pub bytes_matched:bool,
}
#[tauri::command]
pub fn verify_attached_evidence(request:VerifyEvidenceRequest)->Result<VerifiedEvidence,String>{
    enforce_operator()?;
    let guard=active().lock().map_err(|_|"Vault lock unavailable.")?;
    let current=guard.as_ref().ok_or("Unlock this case vault before checking original evidence.")?;
    if current.session.case_reference()!=request.case_reference {
        return Err("Evidence verification refused: the active vault belongs to another case.".into());
    }
    verified_blob(&current.path,&current.session,&request.blob_id,
                  &request.expected_sha256,request.expected_bytes)?;
    Ok(VerifiedEvidence{blob_id:request.blob_id,
        authenticated:true,sha256_matched:true,bytes_matched:true})
}


#[derive(Deserialize)]
pub struct ListEvidenceRequest {
    case_reference:String,
}
#[derive(Serialize)]
pub struct AvailableEvidence {
    pub blob_id:String,
    pub sha256:String,
    pub bytes:u64,
    pub extension:String,
}
#[tauri::command]
pub fn list_case_evidence(request:ListEvidenceRequest)->Result<Vec<AvailableEvidence>,String>{
    enforce_operator()?;
    let guard=active().lock().map_err(|_|"Vault lock unavailable.")?;
    let current=guard.as_ref().ok_or("Unlock the case vault before recovering stored originals.")?;
    if current.session.case_reference()!=request.case_reference {
        return Err("Cannot inspect another case's encrypted evidence.".into());
    }
    let files=list_opaque_blobs(&current.path)?;
    let mut found=Vec::with_capacity(files.len());
    for (id,path) in files {
        let sealed=fs::read(&path).map_err(|_|"Could not read encrypted original.".to_string())?;
        let plaintext=error_message(current.session.decrypt_document(&sealed,&id))?;
        let ext=if plaintext.starts_with(b"%PDF-") {"pdf"}
            else if plaintext.starts_with(&[0x89,0x50,0x4e,0x47]) {"png"}
            else if plaintext.starts_with(&[0xff,0xd8,0xff]) {"jpg"}
            else if plaintext.starts_with(b"II") || plaintext.starts_with(b"MM") {"tif"}
            else {"txt"};
        found.push(AvailableEvidence {
            blob_id:id,sha256:format!("{:x}",Sha256::digest(&*plaintext)),
            bytes:plaintext.len() as u64,extension:ext.into()
        });
    }
    found.sort_by(|a,b|a.blob_id.cmp(&b.blob_id));
    Ok(found)
}
#[derive(Deserialize)]
pub struct SyntheticAutosaveRequest {
    snapshot: serde_json::Value,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[derive(Serialize)]
pub struct SyntheticAutosaveStatus {
    pub active: bool,
    pub path: Option<String>,
}
#[tauri::command]
pub fn synthetic_autosave_status() -> Result<SyntheticAutosaveStatus, String> {
    enforce_operator()?;
    let guard = active().lock().map_err(|_| "Vault lock unavailable.")?;
    Ok(SyntheticAutosaveStatus {
        active: guard.is_some(),
        path: guard.as_ref().map(|a| a.path.display().to_string()),
    })
}
#[tauri::command]
pub fn autosave_synthetic_case(request: SyntheticAutosaveRequest) -> Result<SyntheticAutosaveStatus, String> {
    enforce_operator()?;
    let snapshot_mode=request.snapshot.get("synthetic_only").and_then(|v|v.as_bool()).ok_or("Missing mode.")?;
    validate_local_ack(snapshot_mode,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    let snapshot = Zeroizing::new(
        serde_json::to_vec(&request.snapshot).map_err(|_| "Invalid synthetic case snapshot.".to_string())?
    );
    let mut guard = active().lock().map_err(|_| "Vault lock unavailable.")?;
    let current = guard.as_mut().ok_or("Create or unlock an encrypted case vault to enable automatic saving.")?;
    if current.synthetic_only!=snapshot_mode {return Err("Cannot switch an unlocked vault between training and local case mode.".into());}
    // Encrypting does not mutate the disk; compare the current file first.
    let bytes = error_message(current.session.encrypt_update(&snapshot))?;
    atomic_ciphertext_replace(&current.path, &bytes, &current.expected_cipher_hash)?;
    current.expected_cipher_hash = Sha256::digest(&bytes).to_vec();
    Ok(SyntheticAutosaveStatus {active:true,path:Some(current.path.display().to_string())})
}
#[tauri::command]
pub fn lock_synthetic_autosave() -> Result<(),String> {
    let mut guard=active().lock().map_err(|_| "Vault lock unavailable.")?;
    *guard=None;
    Ok(())
}

#[derive(Deserialize)]
pub struct CreateSyntheticVaultRequest {
    output_path: String,
    snapshot: serde_json::Value,
    practitioner_passphrase: String,
    organization_recovery_passphrase: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[derive(Deserialize)]
pub struct OpenSyntheticVaultRequest {
    input_path: String,
    practitioner_passphrase: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[derive(Deserialize)]
pub struct BackupSyntheticVaultRequest {
    input_path: String,
    output_path: String,
    practitioner_passphrase: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[derive(Deserialize)]
pub struct RecoverSyntheticVaultRequest {
    input_path: String,
    output_path: String,
    old_organization_passphrase: String,
    new_practitioner_passphrase: String,
    new_organization_passphrase: String,
    actor_code: String,
    recovery_reason: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[derive(Serialize)]
pub struct SealedFileResult {
    pub path: String,
    pub encrypted: bool,
    pub synthetic_only: bool,
    pub note: String,
}
fn filename_target(path: &str, extensions: &[&str]) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_absolute()
        || !extensions
            .iter()
            .any(|ext| p.extension().and_then(|e| e.to_str()) == Some(*ext))
    {
        return Err("Choose a local absolute path with the permitted vault extension.".into());
    }
    Ok(p)
}
fn read_encrypted(path: &str) -> Result<Vec<u8>, String> {
    let p = filename_target(path, &["soarvault", "soarbackup"])?;
    let meta = fs::symlink_metadata(&p).map_err(|_| "Encrypted file does not exist.".to_string())?;
    if !meta.file_type().is_file() || meta.len() == 0 || meta.len() as usize > MAX_ENVELOPE_BYTES {
        return Err("Invalid or oversized sealed vault file.".into());
    }
    fs::read(&p).map_err(|_| "Cannot read sealed vault.".into())
}
fn new_encrypted_file(path: &str, extension: &str, data: &[u8]) -> Result<String, String> {
    let p = filename_target(path, &[extension])?;
    if data.is_empty() || data.len() > MAX_ENVELOPE_BYTES {
        return Err("Encrypted data size is out of bounds.".into());
    }
    if !p.parent().is_some_and(Path::is_dir) {
        return Err("Destination directory does not exist.".into());
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&p).map_err(|_| {
        "Cannot create file: it may already exist or the directory may be inaccessible.".to_string()
    })?;
    if let Err(_err) = file.write_all(data).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&p);
        return Err("Could not complete encrypted file write.".into());
    }
    Ok(p.display().to_string())
}
fn validate_local_ack(synthetic:bool,training_confirmed:bool,risk_ack:bool)->Result<(),String>{
    if synthetic && training_confirmed && !risk_ack {return Ok(());}
    if !synthetic && !training_confirmed && risk_ack {return Ok(());}
    Err("Confirm exactly one case mode. Local cases require an explicit privacy-risk acknowledgment and encrypted vault storage.".into())
}
fn validate_sealed_access(encrypted:&[u8],training:bool,risk:bool)->Result<bool,String>{
    let synthetic=error_message(encrypted_file_is_synthetic(encrypted))?;
    validate_local_ack(synthetic,training,risk)?;
    Ok(synthetic)
}
fn error_message<T>(r: Result<T, soar_storage::sealed_vault::VaultCryptoError>) -> Result<T, String> {
    r.map_err(|_| "Vault operation failed. Check the file, credentials, version and case format.".into())
}
#[tauri::command]
pub fn create_synthetic_vault(
    request: CreateSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    enforce_operator()?;
    let synthetic = request.snapshot.get("synthetic_only").and_then(|v|v.as_bool()).ok_or("Missing case mode.")?;
    validate_local_ack(synthetic,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    let practitioner = Zeroizing::new(request.practitioner_passphrase);
    let recovery = Zeroizing::new(request.organization_recovery_passphrase);
    let snapshot = Zeroizing::new(
        serde_json::to_vec(&request.snapshot).map_err(|_| "Invalid synthetic snapshot.".to_string())?,
    );
    let sealed = error_message(seal_local_case(&snapshot, &practitioner, &recovery))?;
    if error_message(encrypted_file_is_synthetic(&sealed))? != synthetic {
        return Err("Case mode mismatch; encrypted file not created.".into());
    }
    let path = new_encrypted_file(&request.output_path, "soarvault", &sealed)?;
    begin_autosave(&path, &sealed, &practitioner)?;
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: synthetic,
        note: if synthetic {"Fictional training snapshot; not production PHI storage".into()}
          else {"Encrypted local case snapshot v2. No SQLCipher, authenticated staff access or PHI compliance assessment; handle under approved organizational security policy.".into()},
    })
}
#[tauri::command]
pub fn open_synthetic_vault(
    request: OpenSyntheticVaultRequest,
) -> Result<serde_json::Value, String> {
    enforce_operator()?;
    let passphrase = Zeroizing::new(request.practitioner_passphrase);
    let sealed = read_encrypted(&request.input_path)?;
    validate_sealed_access(&sealed,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    let plaintext = error_message(open_practitioner(&sealed, &passphrase))?;
    let value: serde_json::Value = serde_json::from_slice(&plaintext)
        .map_err(|_| "Opened file is not a valid encrypted case snapshot.".to_string())?;
    begin_autosave(&request.input_path, &sealed, &passphrase)?;
    Ok(value)
}
fn list_opaque_blobs(vault:&Path)->Result<Vec<(String,PathBuf)>,String>{
    let folder=blob_folder(vault);
    if !folder.exists(){return Ok(vec![])}
    let meta=fs::symlink_metadata(&folder).map_err(|_|"Cannot inspect encrypted evidence folder.".to_string())?;
    if !meta.file_type().is_dir(){return Err("Evidence storage path is not a folder.".into())}
    let mut blobs=vec![];
    for entry in fs::read_dir(&folder).map_err(|_|"Cannot enumerate case attachments.".to_string())?{
        let entry=entry.map_err(|_|"Cannot enumerate case attachments.".to_string())?;
        let path=entry.path();
        let m=fs::symlink_metadata(&path).map_err(|_|"Cannot inspect source attachment.".to_string())?;
        if !m.file_type().is_file()||m.len()>MAX_DOCUMENT_ENVELOPE_BYTES as u64{
            return Err("Invalid attachment file in encrypted folder.".into());
        }
        let name=path.file_name().and_then(|v|v.to_str()).ok_or("Invalid attachment filename.")?;
        let id=name.strip_suffix(".soarblob").ok_or("Unexpected file in encrypted attachment folder.")?;
        blob_path(vault,id)?;
        blobs.push((id.into(),path));
    }
    Ok(blobs)
}
fn copy_blob_folder_for_backup(src:&Path,dest:&Path)->Result<(),String>{
    let files=list_opaque_blobs(src)?;
    if files.is_empty(){return Ok(())}
    let folder=blob_folder(dest);
    if folder.exists(){return Err("Backup attachment destination already exists.".into())}
    fs::create_dir(&folder).map_err(|_|"Cannot create encrypted backup attachment folder.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _=fs::set_permissions(&folder,fs::Permissions::from_mode(0o700));
    }
    for (id,path) in files{
        let ciphertext=fs::read(path).map_err(|_|"Cannot read encrypted backup attachment.".to_string())?;
        let target=blob_path(dest,&id)?;
        new_encrypted_file(&target.display().to_string(),"soarblob",&ciphertext)?;
    }
    Ok(())
}
fn reencrypt_blobs_for_recovery(
    original_path:&Path,recovered_path:&Path,
    original_vault:&[u8],new_vault:&[u8],
    old_org_secret:&str,new_practitioner_secret:&str
)->Result<(),String>{
    let files=list_opaque_blobs(original_path)?;
    if files.is_empty(){return Ok(())}
    let folder=blob_folder(recovered_path);
    if folder.exists(){return Err("Recovery attachment destination already exists.".into())}
    fs::create_dir(&folder).map_err(|_|"Cannot create recovered evidence folder.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _=fs::set_permissions(&folder,fs::Permissions::from_mode(0o700));
    }
    for (id,path) in files {
        let original_blob=fs::read(&path).map_err(|_|"Cannot read original encrypted evidence.".to_string())?;
        let (rekeyed_id,rekeyed)=error_message(reencrypt_document_for_recovery(
           original_vault,old_org_secret,new_vault,new_practitioner_secret,&original_blob))?;
        if id!=rekeyed_id{return Err("Evidence blob ID mismatch during rekey.".into())}
        let target=blob_path(recovered_path,&id)?;
        new_encrypted_file(&target.display().to_string(),"soarblob",&rekeyed)?;
    }
    Ok(())
}

#[tauri::command]
pub fn backup_synthetic_vault(
    request: BackupSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    enforce_operator()?;
    let passphrase = Zeroizing::new(request.practitioner_passphrase);
    let sealed = read_encrypted(&request.input_path)?;
    let synthetic=validate_sealed_access(&sealed,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    error_message(authenticate_backup(&sealed, &passphrase))?;
    let verified_count=verify_snapshot_blobs(Path::new(&request.input_path),&sealed,&passphrase)?;
    let output=filename_target(&request.output_path,&["soarbackup"])?;
    if output.exists()||blob_folder(&output).exists(){
        return Err("Backup destination must not exist.".into());
    }
    if let Err(error)=copy_blob_folder_for_backup(Path::new(&request.input_path),&output){
        let _=fs::remove_dir_all(blob_folder(&output));
        return Err(error);
    }
    let path=match new_encrypted_file(&request.output_path,"soarbackup",&sealed){
        Ok(path)=>path,
        Err(error)=>{
            let _=fs::remove_dir_all(blob_folder(&output));
            return Err(error);
        }
    };
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: synthetic,
        note: format!("Encrypted snapshot and attachments copied; {verified_count} registered original(s) authenticated against stored case metadata. Keep the .blobs folder alongside this backup."),
    })
}
#[tauri::command]
pub fn recover_synthetic_vault(
    request: RecoverSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    enforce_operator()?;
    let original = read_encrypted(&request.input_path)?;
    let synthetic=validate_sealed_access(&original,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    let old_recovery = Zeroizing::new(request.old_organization_passphrase);
    let next_practitioner = Zeroizing::new(request.new_practitioner_passphrase);
    let next_recovery = Zeroizing::new(request.new_organization_passphrase);
    let encrypted = error_message(recover_and_rekey(
        &original, &old_recovery, &next_practitioner, &next_recovery,
        &request.actor_code, &request.recovery_reason,
    ))?;
    let output=filename_target(&request.output_path,&["soarvault"])?;
    if output.exists()||blob_folder(&output).exists(){
        return Err("Recovered case destination or document folder already exists.".into());
    }
    if let Err(error)=reencrypt_blobs_for_recovery(
        Path::new(&request.input_path),&output,&original,&encrypted,
        &old_recovery,&next_practitioner
    ){
        let _=fs::remove_dir_all(blob_folder(&output));
        return Err(error);
    }
    let path=match new_encrypted_file(&request.output_path,"soarvault",&encrypted){
        Ok(path)=>path,
        Err(error)=>{
            let _=fs::remove_dir_all(blob_folder(&output));
            return Err(error);
        }
    };
    // Recovery custodian never enters the normal editing session.
    lock_synthetic_autosave()?;
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: synthetic,
        note: "Emergency rewrap completed without returning case data. Old copies remain accessible with old credentials.".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    // Native vault commands share one per-process active session. Serialize
    // these two integration tests instead of racing to replace that session.
    static VAULT_INTEGRATION_LOCK: std::sync::OnceLock<std::sync::Mutex<()>> =
        std::sync::OnceLock::new();
    fn vault_test_guard() -> std::sync::MutexGuard<'static,()> {
        VAULT_INTEGRATION_LOCK.get_or_init(||std::sync::Mutex::new(())).lock().unwrap()
    }


    fn target(ext: &str) -> String {
        // Only synthetic ciphertext is ever written; unique temp filenames for CI.
        let nonce = SEQUENCE.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir()
            .join(format!("soar-training-{}-{}.{}", std::process::id(), nonce, ext))
            .display()
            .to_string()
    }
    #[test]
    fn refuses_overwrite_and_wrong_file_types() {
        let path=target("soarvault");
        let output=new_encrypted_file(&path,"soarvault",b"synthetic-sealed-test").unwrap();
        assert_eq!(output,path);
        assert!(new_encrypted_file(&path,"soarvault",b"second-copy").is_err());
        assert_eq!(std::fs::read(&path).unwrap(),b"synthetic-sealed-test");
        std::fs::remove_file(&path).unwrap();
        assert!(new_encrypted_file(&target("json"),"soarvault",b"ciphertext").is_err());
    }
    #[test]
    fn refuses_empty_or_insecure_paths() {
        assert!(new_encrypted_file("relative.soarvault","soarvault",b"bytes").is_err());
        assert!(new_encrypted_file(&target("soarbackup"),"soarbackup",b"").is_err());
        assert!(read_encrypted("relative.soarvault").is_err());
    }

    #[test]
    fn restricted_local_case_requires_explicit_risk_ack_and_roundtrips_encrypted() {
        let _test_guard=vault_test_guard();
        const OP:&str="local-operator-password-2026";
        const ORG:&str="local-nonprofit-recovery-2026";
        let path=target("soarvault");
        let snapshot=serde_json::json!({
            "file_kind":"soar-desk-local-case-snapshot",
            "schema_version":2,"synthetic_only":false,
            "case_reference":"CASE-12345678-abcd-efab-1234-123456789abc",
            "programs":["ssi","ssdi"],"answers":{},"rows":{},"evidence":[],
            "signatures":[],
            "submissions":{"records":[],"events":[]}
        });
        assert!(create_synthetic_vault(CreateSyntheticVaultRequest {
            output_path:path.clone(),snapshot:snapshot.clone(),
            practitioner_passphrase:OP.into(),
            organization_recovery_passphrase:ORG.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).is_err());
        assert!(!std::path::Path::new(&path).exists());
        let created=create_synthetic_vault(CreateSyntheticVaultRequest {
            output_path:path.clone(),snapshot:snapshot.clone(),
            practitioner_passphrase:OP.into(),
            organization_recovery_passphrase:ORG.into(),
            synthetic_confirmed:false,local_risk_acknowledged:true
        }).unwrap();
        assert!(!created.synthetic_only);
        assert!(!String::from_utf8_lossy(&std::fs::read(&path).unwrap()).contains("case_reference"));
        assert!(open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:path.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).is_err());
        let opened=open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:path.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:false,local_risk_acknowledged:true
        }).unwrap();
        assert_eq!(opened,snapshot);
        lock_synthetic_autosave().unwrap();
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn document_attach_backup_and_guarded_plaintext_export() {
        let _test_guard=vault_test_guard();
        const OP:&str="operator-test-passphrase-2026";
        const ORG:&str="organization-recovery-passphrase-2026";
        let vault=target("soarvault");
        let src=target("pdf");
        let dest=target("pdf");
        let backup=target("soarbackup");
        let case_id="SYN-DOCUMENT-TEST";
        std::fs::write(&src,b"%PDF-1.7\nFICTIONAL MEDICAL RECORD ONLY").unwrap();
        let snapshot=serde_json::json!({
            "file_kind":"soar-desk-synthetic-case-snapshot","schema_version":1,
            "synthetic_only":true,"case_reference":case_id,
            "programs":["ssdi"],"answers":{},"rows":{},"evidence":[],
            "submissions":{"records":[],"events":[]}
        });
        create_synthetic_vault(CreateSyntheticVaultRequest{
            output_path:vault.clone(),snapshot,
            practitioner_passphrase:OP.into(),organization_recovery_passphrase:ORG.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        let attached=attach_evidence_document(AttachEvidenceRequest {
            source_path:src.clone(),case_reference:case_id.into(),expected_sha256:None,
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        assert_eq!(attached.bytes,std::fs::metadata(&src).unwrap().len());
        assert!(verify_attached_evidence(VerifyEvidenceRequest{case_reference:case_id.into(),blob_id:attached.blob_id.clone(),expected_sha256:attached.sha256.clone(),expected_bytes:attached.bytes}).is_ok());
        let sealed=std::fs::read(&attached.encrypted_path).unwrap();
        assert!(!String::from_utf8_lossy(&sealed).contains("FICTIONAL MEDICAL RECORD ONLY"));
        assert!(export_evidence_document(ExportEvidenceRequest{
            case_reference:case_id.into(),blob_id:attached.blob_id.clone(),
            output_path:dest.clone(),acknowledge_plaintext_export:false
        }).is_err());
        assert!(!std::path::Path::new(&dest).exists());
        let saved=export_evidence_document(ExportEvidenceRequest{
            case_reference:case_id.into(),blob_id:attached.blob_id,
            output_path:dest.clone(),acknowledge_plaintext_export:true
        }).unwrap();
        assert_eq!(saved,dest);
        assert_eq!(std::fs::read(&dest).unwrap(),std::fs::read(&src).unwrap());
        backup_synthetic_vault(BackupSyntheticVaultRequest{
            input_path:vault.clone(),output_path:backup.clone(),
            practitioner_passphrase:OP.into(),synthetic_confirmed:true,
            local_risk_acknowledged:false
        }).unwrap();
        let backup_dir=blob_folder(std::path::Path::new(&backup));
        assert_eq!(std::fs::read_dir(&backup_dir).unwrap().count(),1);
        lock_synthetic_autosave().unwrap();
        for file in [src,dest,vault,backup] {std::fs::remove_file(file).unwrap();}
        let _=std::fs::remove_dir_all(std::path::Path::new(&attached.encrypted_path).parent().unwrap());
        let _=std::fs::remove_dir_all(backup_dir);
    }


    #[test]
    fn rejects_backup_with_missing_registered_original() {
        let case=serde_json::json!({
          "file_kind":"soar-desk-synthetic-case-snapshot",
          "schema_version":1,"synthetic_only":true,
          "case_reference":"SYN-MISSING-SOURCE",
          "programs":["ssi"],"answers":{},"rows":{},
          "submissions":{"records":[],"events":[]},
          "evidence":[{"blobId":"abcdefabcdefabcdefabcdefabcdefab",
                       "sha256":"a".repeat(64),"bytes":27}]
        });
        let operator="fictional-test-operator-passphrase";
        let custodian="fictional-test-custodian-passphrase";
        let sealed=seal_local_case(case.to_string().as_bytes(),operator,custodian).unwrap();
        let absent=std::env::temp_dir().join("soar-nonexistent-attachment-test");
        assert!(verify_snapshot_blobs(&absent,&sealed,operator).is_err());
    }

    #[test]
    fn end_to_end_create_open_backup_and_organizational_recovery() {
        let _test_guard=vault_test_guard();
        const OP:&str="synthetic-operator-password-2026";
        const ORG:&str="synthetic-nonprofit-recovery-2026";
        const NEW_OP:&str="replacement-practitioner-password-2026";
        const NEW_ORG:&str="replacement-organization-recovery-2026";
        let original=target("soarvault");
        let backup=target("soarbackup");
        let recovered=target("soarvault");
        let payload=serde_json::json!({
            "file_kind":"soar-desk-synthetic-case-snapshot",
            "schema_version":1,"synthetic_only":true,
            "case_reference":"SYN-CASE-TEST","programs":["ssdi"],
            "include_deferred":false,
            "answers":{"person.name":{"value":"Fictional Jane Doe","status":"reported","source":"test"}},
            "rows":{},"evidence":[],
            "submissions":{"records":[],"events":[]}
        });
        create_synthetic_vault(CreateSyntheticVaultRequest {
            output_path:original.clone(),snapshot:payload.clone(),
            practitioner_passphrase:OP.into(),
            organization_recovery_passphrase:ORG.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        let mut file=std::fs::read(&original).unwrap();
        assert!(!String::from_utf8_lossy(&file).contains("Fictional Jane Doe"));
        let reopened=open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:original.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        assert_eq!(reopened,payload);
        assert!(open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:original.clone(),practitioner_passphrase:ORG.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).is_err());
        // Autosave encrypts a changed snapshot, retains the prior encrypted
        // generation, and never writes identifiable plaintext to disk.
        let mut revision=payload.clone();
        revision["answers"]["person.name"]["value"]=serde_json::json!("Fictional autosaved name");
        let status=autosave_synthetic_case(SyntheticAutosaveRequest {
            snapshot:revision.clone(),synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        assert!(status.active);
        let latest=std::fs::read(&original).unwrap();
        assert_ne!(latest,file);
        assert!(!String::from_utf8_lossy(&latest).contains("Fictional autosaved name"));
        let previous_path=format!("{}.previous",original);
        assert_eq!(std::fs::read(&previous_path).unwrap(),file);
        file=latest;
        assert_eq!(open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:original.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap(),revision);
        backup_synthetic_vault(BackupSyntheticVaultRequest {
            input_path:original.clone(),output_path:backup.clone(),
            practitioner_passphrase:OP.into(),synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        assert_eq!(std::fs::read(&backup).unwrap(),file);
        recover_synthetic_vault(RecoverSyntheticVaultRequest {
            input_path:backup.clone(),output_path:recovered.clone(),
            old_organization_passphrase:ORG.into(),
            new_practitioner_passphrase:NEW_OP.into(),
            new_organization_passphrase:NEW_ORG.into(),
            actor_code:"SYN-ORGANIZATION-RECOVERY".into(),
            recovery_reason:"Fictional practitioner device retirement and approved handoff".into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        assert!(open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:recovered.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).is_err());
        let new_case=open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:recovered.clone(),practitioner_passphrase:NEW_OP.into(),
            synthetic_confirmed:true,local_risk_acknowledged:false
        }).unwrap();
        assert!(new_case["recovery_events"].is_array());
        assert_eq!(new_case["case_reference"],"SYN-CASE-TEST");
        assert_eq!(std::fs::read(&original).unwrap(),file);
        for path in [original,backup,recovered,previous_path] {
            std::fs::remove_file(path).unwrap();
        }
    }
}
