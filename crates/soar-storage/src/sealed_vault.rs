//! Synthetic-only encrypted case snapshots and organizational rekeying.
//!
//! This is not the production SQLCipher database. It intentionally accepts
//! only synthetic case JSON, does not persist plaintext, and has no case
//! authorization, OS key binding, hardware unlock, or immutable audit.
//!
//! Cryptography: independently random 256-bit VMK; AES-256-GCM payload and
//! independently nonce'd AES-256-GCM VMK-wrapping slots; Argon2id KEKs.
//! VMK/KEKs/decrypted payload are zeroized on drop where practical.
//! Associated data binds envelope version, vault ID, and slot purpose.
use aes_gcm::{
    aead::{rand_core::RngCore, Aead, OsRng, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub const ENVELOPE_VERSION: u32 = 1;
const MAGIC: &str = "SOAR-DESK-SYNTHETIC-SEALED-VAULT";
pub const MAX_ENVELOPE_BYTES: usize = 4 * 1024 * 1024;
const MAX_PLAINTEXT_BYTES: usize = 2 * 1024 * 1024;
const KDF_MEMORY_KIB: u32 = 64 * 1024;
const KDF_ITERATIONS: u32 = 3;
const KDF_LANES: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultCryptoError {
    InvalidFormat,
    InvalidSyntheticPayload,
    WeakPassphrase,
    EqualPassphrases,
    AuthenticationFailed,
    CorruptEnvelope,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum SlotRole {
    Practitioner,
    OrganizationRecovery,
}
impl SlotRole {
    fn identifier(self) -> &'static str {
        match self {
            Self::Practitioner => "practitioner",
            Self::OrganizationRecovery => "organization_recovery",
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CipherBlock {
    nonce: String,
    ciphertext: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct WrappedSlot {
    role: SlotRole,
    salt: String,
    wrapped_key: CipherBlock,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    file_kind: String,
    version: u32,
    vault_id: String,
    kdf: String,
    cipher: String,
    slots: Vec<WrappedSlot>,
    payload: CipherBlock,
}
fn random<const N: usize>() -> [u8; N] {
    let mut data = [0; N];
    OsRng.fill_bytes(&mut data);
    data
}
fn validate_passphrase(passphrase: &str) -> Result<(), VaultCryptoError> {
    if passphrase.len() < 16 || passphrase.len() > 1024 {
        return Err(VaultCryptoError::WeakPassphrase);
    }
    Ok(())
}
fn validate_vault_id(vault_id: &str) -> Result<(), VaultCryptoError> {
    if !vault_id.starts_with("SYN-")
        || vault_id.len() > 80
        || !vault_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(VaultCryptoError::InvalidSyntheticPayload);
    }
    Ok(())
}
fn valid_case(data: &[u8]) -> Result<(), VaultCryptoError> {
    if data.is_empty() || data.len() > MAX_PLAINTEXT_BYTES {
        return Err(VaultCryptoError::InvalidSyntheticPayload);
    }
    let json: serde_json::Value =
        serde_json::from_slice(data).map_err(|_| VaultCryptoError::InvalidSyntheticPayload)?;
    let case_id = json.get("case_reference").and_then(|v| v.as_str()).unwrap_or("");
    validate_vault_id(case_id)?;
    if json.get("file_kind").and_then(|v| v.as_str())
        != Some("soar-desk-synthetic-case-snapshot")
        || json.get("schema_version").and_then(|v| v.as_u64()) != Some(1)
        || json.get("synthetic_only").and_then(|v| v.as_bool()) != Some(true)
        || !json.get("answers").is_some_and(|v| v.is_object())
        || !json.get("rows").is_some_and(|v| v.is_object())
        || !json.get("evidence").is_some_and(|v| v.is_array())
    {
        return Err(VaultCryptoError::InvalidSyntheticPayload);
    }
    Ok(())
}
fn aad(vault_id: &str, label: &str) -> Vec<u8> {
    format!("{MAGIC}|v{ENVELOPE_VERSION}|{vault_id}|{label}").into_bytes()
}
fn key_cipher(key: &[u8; 32]) -> Result<Aes256Gcm, VaultCryptoError> {
    Aes256Gcm::new_from_slice(key).map_err(|_| VaultCryptoError::CorruptEnvelope)
}
fn encrypt_block(
    key: &[u8; 32],
    message: &[u8],
    associated: &[u8],
) -> Result<CipherBlock, VaultCryptoError> {
    let nonce = random::<12>();
    let encrypted = key_cipher(key)?
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: message,
                aad: associated,
            },
        )
        .map_err(|_| VaultCryptoError::AuthenticationFailed)?;
    Ok(CipherBlock {
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(encrypted),
    })
}
fn decode_exact<const N: usize>(raw: &str) -> Result<[u8; N], VaultCryptoError> {
    let bytes = STANDARD
        .decode(raw)
        .map_err(|_| VaultCryptoError::InvalidFormat)?;
    bytes
        .try_into()
        .map_err(|_| VaultCryptoError::InvalidFormat)
}
fn decrypt_block(
    key: &[u8; 32],
    block: &CipherBlock,
    associated: &[u8],
) -> Result<Zeroizing<Vec<u8>>, VaultCryptoError> {
    let nonce: [u8; 12] = decode_exact(&block.nonce)?;
    let ciphertext = STANDARD
        .decode(&block.ciphertext)
        .map_err(|_| VaultCryptoError::InvalidFormat)?;
    if ciphertext.len() < 16 || ciphertext.len() > MAX_ENVELOPE_BYTES {
        return Err(VaultCryptoError::InvalidFormat);
    }
    let plaintext = key_cipher(key)?
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: associated,
            },
        )
        .map_err(|_| VaultCryptoError::AuthenticationFailed)?;
    Ok(Zeroizing::new(plaintext))
}
fn derive_kek(passphrase: &str, salt: &[u8; 16]) -> Result<Zeroizing<[u8; 32]>, VaultCryptoError> {
    validate_passphrase(passphrase)?;
    let params = Params::new(KDF_MEMORY_KIB, KDF_ITERATIONS, KDF_LANES, Some(32))
        .map_err(|_| VaultCryptoError::CorruptEnvelope)?;
    let kdf = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = Zeroizing::new([0u8; 32]);
    kdf.hash_password_into(passphrase.as_bytes(), salt, &mut *kek)
        .map_err(|_| VaultCryptoError::AuthenticationFailed)?;
    Ok(kek)
}
fn wrap_key(
    role: SlotRole,
    vault_id: &str,
    master: &[u8; 32],
    passphrase: &str,
) -> Result<WrappedSlot, VaultCryptoError> {
    let salt = random::<16>();
    let kek = derive_kek(passphrase, &salt)?;
    Ok(WrappedSlot {
        role,
        salt: STANDARD.encode(salt),
        wrapped_key: encrypt_block(&kek, master, &aad(vault_id, role.identifier()))?,
    })
}
fn parse_envelope(input: &[u8]) -> Result<Envelope, VaultCryptoError> {
    if input.is_empty() || input.len() > MAX_ENVELOPE_BYTES {
        return Err(VaultCryptoError::InvalidFormat);
    }
    let env: Envelope =
        serde_json::from_slice(input).map_err(|_| VaultCryptoError::InvalidFormat)?;
    if env.file_kind != MAGIC
        || env.version != ENVELOPE_VERSION
        || env.kdf != "argon2id-m65536-t3-p1"
        || env.cipher != "aes-256-gcm"
        || env.slots.len() != 2
        || !env.slots.iter().any(|s| s.role == SlotRole::Practitioner)
        || !env
            .slots
            .iter()
            .any(|s| s.role == SlotRole::OrganizationRecovery)
        || env.slots[0].role == env.slots[1].role
    {
        return Err(VaultCryptoError::InvalidFormat);
    }
    validate_vault_id(&env.vault_id)?;
    Ok(env)
}
fn unlock_master(
    env: &Envelope,
    role: SlotRole,
    passphrase: &str,
) -> Result<Zeroizing<[u8; 32]>, VaultCryptoError> {
    let slot = env
        .slots
        .iter()
        .find(|slot| slot.role == role)
        .ok_or(VaultCryptoError::InvalidFormat)?;
    let salt: [u8; 16] = decode_exact(&slot.salt)?;
    let kek = derive_kek(passphrase, &salt)?;
    let master = decrypt_block(&kek, &slot.wrapped_key, &aad(&env.vault_id, role.identifier()))?;
    let key: [u8; 32] = master
        .as_slice()
        .try_into()
        .map_err(|_| VaultCryptoError::InvalidFormat)?;
    Ok(Zeroizing::new(key))
}
fn payload_from_master(
    env: &Envelope,
    master: &[u8; 32],
) -> Result<Zeroizing<Vec<u8>>, VaultCryptoError> {
    let value = decrypt_block(master, &env.payload, &aad(&env.vault_id, "payload"))?;
    valid_case(&value)?;
    let json: serde_json::Value =
        serde_json::from_slice(&value).map_err(|_| VaultCryptoError::CorruptEnvelope)?;
    if json.get("case_reference").and_then(|v| v.as_str()) != Some(env.vault_id.as_str()) {
        return Err(VaultCryptoError::AuthenticationFailed);
    }
    Ok(value)
}

/// Create a complete, independently wrapped synthetic vault. Never write
/// passwords or plaintext data into the header, filename or audit logs.
pub fn seal_synthetic_case(
    snapshot_json: &[u8],
    practitioner_passphrase: &str,
    organization_recovery_passphrase: &str,
) -> Result<Vec<u8>, VaultCryptoError> {
    valid_case(snapshot_json)?;
    validate_passphrase(practitioner_passphrase)?;
    validate_passphrase(organization_recovery_passphrase)?;
    if practitioner_passphrase == organization_recovery_passphrase {
        return Err(VaultCryptoError::EqualPassphrases);
    }
    let json: serde_json::Value =
        serde_json::from_slice(snapshot_json).map_err(|_| VaultCryptoError::InvalidSyntheticPayload)?;
    let id = json["case_reference"]
        .as_str()
        .ok_or(VaultCryptoError::InvalidSyntheticPayload)?;
    let master = Zeroizing::new(random::<32>());
    let env = Envelope {
        file_kind: MAGIC.into(),
        version: ENVELOPE_VERSION,
        vault_id: id.into(),
        kdf: "argon2id-m65536-t3-p1".into(),
        cipher: "aes-256-gcm".into(),
        slots: vec![
            wrap_key(SlotRole::Practitioner, id, &master, practitioner_passphrase)?,
            wrap_key(
                SlotRole::OrganizationRecovery,
                id,
                &master,
                organization_recovery_passphrase,
            )?,
        ],
        payload: encrypt_block(&master, snapshot_json, &aad(id, "payload"))?,
    };
    serde_json::to_vec(&env).map_err(|_| VaultCryptoError::CorruptEnvelope)
}

/// Routine unlock never accepts the organizational recovery credential.
pub fn open_practitioner(
    sealed: &[u8],
    practitioner_passphrase: &str,
) -> Result<Zeroizing<Vec<u8>>, VaultCryptoError> {
    let env = parse_envelope(sealed)?;
    let master = unlock_master(&env, SlotRole::Practitioner, practitioner_passphrase)?;
    payload_from_master(&env, &master)
}

/// Recovery ONLY produces a new sealed vault. It does not expose a plaintext
/// case through the recovery API or create routine case-reader permissions.
///
/// The old encrypted file and any copies remain decryptable with the OLD
/// credentials until separately and securely retired; rekeying is not remote
/// revocation. The caller must record recovery authorization and custody.
pub fn recover_and_rekey(
    sealed: &[u8],
    old_org_passphrase: &str,
    new_practitioner_passphrase: &str,
    new_org_passphrase: &str,
    actor_code: &str,
    reason: &str,
) -> Result<Vec<u8>, VaultCryptoError> {
    if actor_code.len() < 3
        || actor_code.len() > 96
        || reason.trim().len() < 12
        || reason.len() > 1000
    {
        return Err(VaultCryptoError::InvalidSyntheticPayload);
    }
    let env = parse_envelope(sealed)?;
    let master = unlock_master(&env, SlotRole::OrganizationRecovery, old_org_passphrase)?;
    let plaintext = payload_from_master(&env, &master)?;
    let mut snapshot: serde_json::Value =
        serde_json::from_slice(&plaintext).map_err(|_| VaultCryptoError::CorruptEnvelope)?;
    let audit = snapshot
        .as_object_mut()
        .ok_or(VaultCryptoError::InvalidSyntheticPayload)?
        .entry("recovery_events")
        .or_insert_with(|| serde_json::Value::Array(Vec::new()));
    let history = audit.as_array_mut().ok_or(VaultCryptoError::InvalidSyntheticPayload)?;
    if history.len() >= 100 {
        return Err(VaultCryptoError::InvalidSyntheticPayload);
    }
    history.push(serde_json::json!({
        "event":"organizational_recovery_rekey",
        "actor":actor_code,
        "reason":reason.trim(),
        "old_vault_retirement":"must_be_completed_outside_this_prototype"
    }));
    let revised = Zeroizing::new(
        serde_json::to_vec(&snapshot).map_err(|_| VaultCryptoError::CorruptEnvelope)?,
    );
    seal_synthetic_case(&revised, new_practitioner_passphrase, new_org_passphrase)
}

/// Authenticate the vault before copying the exact encrypted bytes to a
/// backup destination. Restoring requires the unchanged credential(s).
pub fn authenticate_backup(
    sealed: &[u8],
    practitioner_passphrase: &str,
) -> Result<(), VaultCryptoError> {
    let _ = open_practitioner(sealed, practitioner_passphrase)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const OP: &str = "long-practitioner-passphrase-123";
    const ORG: &str = "independent-organization-recovery-987";
    const NEXT_OP: &str = "new-practitioner-passphrase-456";
    const NEXT_ORG: &str = "new-organization-recovery-789";

    fn test_case() -> Vec<u8> {
        serde_json::json!({
            "file_kind":"soar-desk-synthetic-case-snapshot",
            "schema_version":1,
            "synthetic_only":true,
            "case_reference":"SYN-JANE-001",
            "programs":["ssi","ssdi"],
            "answers":{"person.name":{"value":"Fictional Jane Doe","status":"reported","source":"synthetic"}},
            "rows":{},
            "evidence":[],
            "submissions":{"records":[],"events":[]}
        }).to_string().into_bytes()
    }
    #[test]
    fn real_encryption_and_practitioner_unlock() {
        let data = test_case();
        let encrypted = seal_synthetic_case(&data, OP, ORG).unwrap();
        assert!(!String::from_utf8_lossy(&encrypted).contains("Fictional Jane Doe"));
        assert_eq!(&*open_practitioner(&encrypted, OP).unwrap(), &data);
        assert_eq!(open_practitioner(&encrypted, ORG).unwrap_err(), VaultCryptoError::AuthenticationFailed);
        assert_eq!(open_practitioner(&encrypted, "wrong-but-valid-password").unwrap_err(), VaultCryptoError::AuthenticationFailed);
    }
    #[test]
    fn randomized_ciphertext_and_authenticated_backup() {
        let data = test_case();
        let one = seal_synthetic_case(&data, OP, ORG).unwrap();
        let two = seal_synthetic_case(&data, OP, ORG).unwrap();
        assert_ne!(one, two);
        authenticate_backup(&one, OP).unwrap();
        assert_eq!(authenticate_backup(&one, ORG), Err(VaultCryptoError::AuthenticationFailed));
        assert_eq!(&*open_practitioner(&one, OP).unwrap(), &data);
    }
    #[test]
    fn tampering_fails_and_version_pinning() {
        let one = seal_synthetic_case(&test_case(), OP, ORG).unwrap();
        let mut changed: serde_json::Value = serde_json::from_slice(&one).unwrap();
        changed["vault_id"] = serde_json::json!("SYN-OTHER");
        assert!(open_practitioner(&serde_json::to_vec(&changed).unwrap(), OP).is_err());
        changed = serde_json::from_slice(&one).unwrap();
        changed["version"] = serde_json::json!(2);
        assert_eq!(open_practitioner(&serde_json::to_vec(&changed).unwrap(), OP).unwrap_err(), VaultCryptoError::InvalidFormat);
        changed = serde_json::from_slice(&one).unwrap();
        changed["payload"]["ciphertext"] = serde_json::json!("AAAA");
        assert!(open_practitioner(&serde_json::to_vec(&changed).unwrap(), OP).is_err());
        changed = serde_json::from_slice(&one).unwrap();
        changed["slots"][0]["salt"] = serde_json::json!("AAAA");
        assert!(open_practitioner(&serde_json::to_vec(&changed).unwrap(), OP).is_err());
    }
    #[test]
    fn recovery_rotates_both_protectors_without_plaintext_return() {
        let one = seal_synthetic_case(&test_case(), OP, ORG).unwrap();
        let two = recover_and_rekey(&one, ORG, NEXT_OP, NEXT_ORG,
            "SYN-CUSTODIAN", "Practitioner device retired and access reassigned").unwrap();
        assert_ne!(one, two);
        assert_eq!(open_practitioner(&two, OP).unwrap_err(), VaultCryptoError::AuthenticationFailed);
        assert!(open_practitioner(&two, NEXT_OP).unwrap().windows(b"organizational_recovery_rekey".len())
            .any(|w| w == b"organizational_recovery_rekey"));
        assert_eq!(open_practitioner(&two, NEXT_ORG).unwrap_err(), VaultCryptoError::AuthenticationFailed);
        assert!(open_practitioner(&one, OP).is_ok()); // old copies need retirement
    }
    #[test]
    fn invalid_secrets_and_payloads_fail_closed() {
        assert_eq!(seal_synthetic_case(&test_case(), OP, OP), Err(VaultCryptoError::EqualPassphrases));
        assert_eq!(seal_synthetic_case(&test_case(), "short", ORG), Err(VaultCryptoError::WeakPassphrase));
        assert_eq!(seal_synthetic_case(b"plain text", OP, ORG), Err(VaultCryptoError::InvalidSyntheticPayload));
        let mut data: serde_json::Value = serde_json::from_slice(&test_case()).unwrap();
        data["case_reference"] = serde_json::json!("REAL-JANE");
        assert!(seal_synthetic_case(data.to_string().as_bytes(), OP, ORG).is_err());
    }
}
