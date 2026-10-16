//! Versioned case model and repository contract.
//! No persistent adapter or encryption key loader exists yet. Real-client data
//! MUST NOT be written until the audited encrypted backend is implemented.
use serde::{Deserialize, Serialize};

pub mod recovery;

pub const SCHEMA_VERSION: u32 = 1;
pub const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial.sql");

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OwnerKind { Individual, Organization }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VaultDescriptor {
    pub vault_id: String,
    pub schema_version: u32,
    pub encrypted: bool,
    pub owner_kind: OwnerKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaseStatus { Preparation, EvidenceDevelopment, Filed, Appealing, Closed }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Program { Ssi, Ssdi }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaseSummary {
    pub case_id: String,
    pub status: CaseStatus,
    pub programs: Vec<Program>,
    pub opened_at: String,
    pub closed_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnswerState { NotAsked, Unknown, Reported, Verified, Clarify, NotApplicable }

/// Per-form answers retain the originating edition and evidence relationship.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldAnswer {
    pub answer_id: String,
    pub case_id: String,
    pub canonical_key: String,
    pub form_id: String,
    pub form_edition: String,
    pub question_reference: String,
    pub answer_state: AnswerState,
    pub value_json: String,
    pub evidence_id: Option<String>,
    pub assertion_source: Option<String>,
    pub entered_by: String,
    pub reviewed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentRecord {
    pub document_id: String,
    pub case_id: String,
    pub original_filename: String,
    pub media_type: String,
    pub content_sha256: String,
    pub encrypted_blob_id: String,
    pub byte_size: u64,
    pub added_by: String,
    pub added_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditEvent {
    pub event_id: String,
    pub case_id: Option<String>,
    pub actor_id: String,
    pub action: String,
    pub object_type: String,
    pub object_id: String,
    pub occurred_at: String,
    pub previous_hash: Option<String>,
    pub hash: String,
}

/// This trait is intentionally not implemented by an unencrypted SQLite store.
/// A production implementation MUST require authenticated actor context,
/// authorized case access, encryption, independent audit and key management.
pub trait CaseRepository {
    type Error;
    fn create_case(&mut self, actor_id: &str, case: &CaseSummary) -> Result<(), Self::Error>;
    fn get_case(&self, actor_id: &str, case_id: &str) -> Result<Option<CaseSummary>, Self::Error>;
    fn set_answer(&mut self, actor_id: &str, answer: &FieldAnswer) -> Result<(), Self::Error>;
    fn list_answers(&self, actor_id: &str, case_id: &str) -> Result<Vec<FieldAnswer>, Self::Error>;
    fn list_events(&self, actor_id: &str, case_id: &str) -> Result<Vec<AuditEvent>, Self::Error>;
}

pub fn validate_vault(v: &VaultDescriptor) -> Result<(), &'static str> {
    if !v.encrypted { return Err("Unencrypted SOAR case vaults are prohibited"); }
    if v.schema_version != SCHEMA_VERSION { return Err("Unsupported schema: migration required"); }
    if v.vault_id.trim().is_empty() { return Err("Vault identifier required"); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plaintext_and_unknown_versions_rejected() {
        let mut v = VaultDescriptor { vault_id: "SYN-VAULT".into(), schema_version: 1,
            encrypted: false, owner_kind: OwnerKind::Individual };
        assert!(validate_vault(&v).is_err());
        v.encrypted = true;
        assert!(validate_vault(&v).is_ok());
        v.schema_version = 22;
        assert!(validate_vault(&v).is_err());
    }
    #[test]
    fn schema_has_access_and_audit_boundaries() {
        for name in ["CREATE TABLE case_access", "CREATE TABLE field_answers",
            "CREATE TABLE blob_metadata", "CREATE TABLE form_instances",
            "CREATE TABLE audit_events", "CREATE TRIGGER audit_update_guard"] {
            assert!(INITIAL_SCHEMA.contains(name), "missing {name}");
        }
    }
}
