//! Local, opt-in, *synthetic-only* vault commands.
//! NOT a production case store: no SQLCipher, OS key sealing, user sessions,
//! role grants, immutable audit, or safe PHI handling in the current webview.
//! Secrets arrive through Tauri IPC and may exist transiently in JS memory.
use serde::{Deserialize, Serialize};
use soar_storage::sealed_vault::{
    authenticate_backup, open_practitioner, recover_and_rekey, seal_local_case,
    encrypted_file_is_synthetic, unlock_for_autosave, UnlockedSession, MAX_ENVELOPE_BYTES,
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

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
    let guard = active().lock().map_err(|_| "Vault lock unavailable.")?;
    Ok(SyntheticAutosaveStatus {
        active: guard.is_some(),
        path: guard.as_ref().map(|a| a.path.display().to_string()),
    })
}
#[tauri::command]
pub fn autosave_synthetic_case(request: SyntheticAutosaveRequest) -> Result<SyntheticAutosaveStatus, String> {
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
    let passphrase = Zeroizing::new(request.practitioner_passphrase);
    let sealed = read_encrypted(&request.input_path)?;
    validate_sealed_access(&sealed,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    let plaintext = error_message(open_practitioner(&sealed, &passphrase))?;
    let value: serde_json::Value = serde_json::from_slice(&plaintext)
        .map_err(|_| "Opened file is not a valid encrypted case snapshot.".to_string())?;
    begin_autosave(&request.input_path, &sealed, &passphrase)?;
    Ok(value)
}
#[tauri::command]
pub fn backup_synthetic_vault(
    request: BackupSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    let passphrase = Zeroizing::new(request.practitioner_passphrase);
    let sealed = read_encrypted(&request.input_path)?;
    let synthetic=validate_sealed_access(&sealed,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    error_message(authenticate_backup(&sealed, &passphrase))?;
    let path = new_encrypted_file(&request.output_path, "soarbackup", &sealed)?;
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: synthetic,
        note: "Exact authenticated ciphertext copy; no attachments or production restore policy".into(),
    })
}
#[tauri::command]
pub fn recover_synthetic_vault(
    request: RecoverSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    let original = read_encrypted(&request.input_path)?;
    let synthetic=validate_sealed_access(&original,request.synthetic_confirmed,request.local_risk_acknowledged)?;
    let old_recovery = Zeroizing::new(request.old_organization_passphrase);
    let next_practitioner = Zeroizing::new(request.new_practitioner_passphrase);
    let next_recovery = Zeroizing::new(request.new_organization_passphrase);
    let encrypted = error_message(recover_and_rekey(
        &original, &old_recovery, &next_practitioner, &next_recovery,
        &request.actor_code, &request.recovery_reason,
    ))?;
    let path = new_encrypted_file(&request.output_path, "soarvault", &encrypted)?;
    // Recovery custodian must not gain normal editing access. The replacement
    // practitioner must explicitly open the recovered vault.
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
            "case_reference":"CASE-12345678-abcd-efab-123456789abc",
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
