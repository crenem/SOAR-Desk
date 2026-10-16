//! Local, opt-in, *synthetic-only* vault commands.
//! NOT a production case store: no SQLCipher, OS key sealing, user sessions,
//! role grants, immutable audit, or safe PHI handling in the current webview.
//! Secrets arrive through Tauri IPC and may exist transiently in JS memory.
use serde::{Deserialize, Serialize};
use soar_storage::sealed_vault::{
    authenticate_backup, open_practitioner, recover_and_rekey, seal_synthetic_case,
    MAX_ENVELOPE_BYTES,
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use zeroize::Zeroizing;

#[derive(Deserialize)]
pub struct CreateSyntheticVaultRequest {
    output_path: String,
    snapshot: serde_json::Value,
    practitioner_passphrase: String,
    organization_recovery_passphrase: String,
    synthetic_confirmed: bool,
}
#[derive(Deserialize)]
pub struct OpenSyntheticVaultRequest {
    input_path: String,
    practitioner_passphrase: String,
    synthetic_confirmed: bool,
}
#[derive(Deserialize)]
pub struct BackupSyntheticVaultRequest {
    input_path: String,
    output_path: String,
    practitioner_passphrase: String,
    synthetic_confirmed: bool,
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
fn is_synthetic_confirmation(ok: bool) -> Result<(), String> {
    if !ok {
        return Err("Only explicitly confirmed fictional training records are permitted.".into());
    }
    Ok(())
}
fn error_message<T>(r: Result<T, soar_storage::sealed_vault::VaultCryptoError>) -> Result<T, String> {
    r.map_err(|_| "Vault operation failed. Check the file, credentials, synthetic format and edition.".into())
}
#[tauri::command]
pub fn create_synthetic_vault(
    request: CreateSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    is_synthetic_confirmation(request.synthetic_confirmed)?;
    let practitioner = Zeroizing::new(request.practitioner_passphrase);
    let recovery = Zeroizing::new(request.organization_recovery_passphrase);
    let snapshot = Zeroizing::new(
        serde_json::to_vec(&request.snapshot).map_err(|_| "Invalid synthetic snapshot.".to_string())?,
    );
    let sealed = error_message(seal_synthetic_case(&snapshot, &practitioner, &recovery))?;
    let path = new_encrypted_file(&request.output_path, "soarvault", &sealed)?;
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: true,
        note: "Fictional training snapshot; not SQLCipher or production PHI storage".into(),
    })
}
#[tauri::command]
pub fn open_synthetic_vault(
    request: OpenSyntheticVaultRequest,
) -> Result<serde_json::Value, String> {
    is_synthetic_confirmation(request.synthetic_confirmed)?;
    let passphrase = Zeroizing::new(request.practitioner_passphrase);
    let sealed = read_encrypted(&request.input_path)?;
    let plaintext = error_message(open_practitioner(&sealed, &passphrase))?;
    let value: serde_json::Value = serde_json::from_slice(&plaintext)
        .map_err(|_| "Opened file is not a valid fictional snapshot.".to_string())?;
    Ok(value)
}
#[tauri::command]
pub fn backup_synthetic_vault(
    request: BackupSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    is_synthetic_confirmation(request.synthetic_confirmed)?;
    let passphrase = Zeroizing::new(request.practitioner_passphrase);
    let sealed = read_encrypted(&request.input_path)?;
    error_message(authenticate_backup(&sealed, &passphrase))?;
    let path = new_encrypted_file(&request.output_path, "soarbackup", &sealed)?;
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: true,
        note: "Exact authenticated ciphertext copy; no attachments or production restore policy".into(),
    })
}
#[tauri::command]
pub fn recover_synthetic_vault(
    request: RecoverSyntheticVaultRequest,
) -> Result<SealedFileResult, String> {
    is_synthetic_confirmation(request.synthetic_confirmed)?;
    let original = read_encrypted(&request.input_path)?;
    let old_recovery = Zeroizing::new(request.old_organization_passphrase);
    let next_practitioner = Zeroizing::new(request.new_practitioner_passphrase);
    let next_recovery = Zeroizing::new(request.new_organization_passphrase);
    let encrypted = error_message(recover_and_rekey(
        &original, &old_recovery, &next_practitioner, &next_recovery,
        &request.actor_code, &request.recovery_reason,
    ))?;
    let path = new_encrypted_file(&request.output_path, "soarvault", &encrypted)?;
    Ok(SealedFileResult {
        path,
        encrypted: true,
        synthetic_only: true,
        note: "Emergency rewrap completed without returning case data. Old copies remain accessible with old credentials.".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);

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
    fn end_to_end_create_open_backup_and_organizational_recovery() {
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
            synthetic_confirmed:true
        }).unwrap();
        let file=std::fs::read(&original).unwrap();
        assert!(!String::from_utf8_lossy(&file).contains("Fictional Jane Doe"));
        let reopened=open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:original.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:true
        }).unwrap();
        assert_eq!(reopened,payload);
        assert!(open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:original.clone(),practitioner_passphrase:ORG.into(),
            synthetic_confirmed:true
        }).is_err());
        backup_synthetic_vault(BackupSyntheticVaultRequest {
            input_path:original.clone(),output_path:backup.clone(),
            practitioner_passphrase:OP.into(),synthetic_confirmed:true
        }).unwrap();
        assert_eq!(std::fs::read(&backup).unwrap(),file);
        recover_synthetic_vault(RecoverSyntheticVaultRequest {
            input_path:backup.clone(),output_path:recovered.clone(),
            old_organization_passphrase:ORG.into(),
            new_practitioner_passphrase:NEW_OP.into(),
            new_organization_passphrase:NEW_ORG.into(),
            actor_code:"SYN-ORGANIZATION-RECOVERY".into(),
            recovery_reason:"Fictional practitioner device retirement and approved handoff".into(),
            synthetic_confirmed:true
        }).unwrap();
        assert!(open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:recovered.clone(),practitioner_passphrase:OP.into(),
            synthetic_confirmed:true
        }).is_err());
        let new_case=open_synthetic_vault(OpenSyntheticVaultRequest {
            input_path:recovered.clone(),practitioner_passphrase:NEW_OP.into(),
            synthetic_confirmed:true
        }).unwrap();
        assert!(new_case["recovery_events"].is_array());
        assert_eq!(new_case["case_reference"],"SYN-CASE-TEST");
        assert_eq!(std::fs::read(&original).unwrap(),file);
        for path in [original,backup,recovered] {
            std::fs::remove_file(path).unwrap();
        }
    }
}
