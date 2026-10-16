//! Policy-only organizational key-recovery model.
//!
//! No encryption keys, decryption methods, operating-system credentials,
//! persistent recovery codes, or bypass of case access are implemented here.
//! This module is a fail-closed contract for a future audited vault service.

use serde::{Deserialize, Serialize};

/// Non-secret metadata identifying the independently wrapped VMK slots.
/// The actual wrapped-key ciphertext is not managed by this policy crate.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnlockSlotKind {
    PractitionerDevice,
    OrganizationalRecovery,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnlockSlotDescriptor {
    pub slot_id: String,
    pub kind: UnlockSlotKind,
    pub protector_version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryCustody {
    /// The nonprofit, not the employee, owns the right to restore the vault.
    NonprofitOrganization,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrganizationalRecoveryPolicy {
    pub organization_id: String,
    pub vault_id: String,
    pub practitioner_principal_id: String,
    /// Named by an organizational enrollment process, not automatically
    /// granted access to any client record.
    pub recovery_custodian_principal_id: String,
    pub custody: RecoveryCustody,
    pub unlock_slots: Vec<UnlockSlotDescriptor>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RecoveryPolicyError {
    MissingIdentity,
    SelfCustodyNotAllowed,
    MissingPractitionerSlot,
    MissingOrganizationRecoverySlot,
    DuplicateSlotId,
    UnsupportedProtectorVersion,
}

pub fn validate_recovery_policy(
    policy: &OrganizationalRecoveryPolicy,
) -> Result<(), RecoveryPolicyError> {
    if [
        &policy.organization_id,
        &policy.vault_id,
        &policy.practitioner_principal_id,
        &policy.recovery_custodian_principal_id,
    ]
    .iter()
    .any(|s| s.trim().is_empty())
    {
        return Err(RecoveryPolicyError::MissingIdentity);
    }
    if policy.practitioner_principal_id == policy.recovery_custodian_principal_id {
        return Err(RecoveryPolicyError::SelfCustodyNotAllowed);
    }
    let mut ids = std::collections::HashSet::new();
    for slot in &policy.unlock_slots {
        if slot.slot_id.trim().is_empty() {
            return Err(RecoveryPolicyError::MissingIdentity);
        }
        if !ids.insert(&slot.slot_id) {
            return Err(RecoveryPolicyError::DuplicateSlotId);
        }
        if slot.protector_version == 0 {
            return Err(RecoveryPolicyError::UnsupportedProtectorVersion);
        }
    }
    if !policy
        .unlock_slots
        .iter()
        .any(|slot| slot.kind == UnlockSlotKind::PractitionerDevice)
    {
        return Err(RecoveryPolicyError::MissingPractitionerSlot);
    }
    if !policy
        .unlock_slots
        .iter()
        .any(|slot| slot.kind == UnlockSlotKind::OrganizationalRecovery)
    {
        return Err(RecoveryPolicyError::MissingOrganizationRecoverySlot);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> OrganizationalRecoveryPolicy {
        OrganizationalRecoveryPolicy {
            organization_id: "SYN-NONPROFIT".into(),
            vault_id: "SYN-VAULT-001".into(),
            practitioner_principal_id: "SYN-PRACTITIONER".into(),
            recovery_custodian_principal_id: "SYN-CUSTODIAN".into(),
            custody: RecoveryCustody::NonprofitOrganization,
            unlock_slots: vec![
                UnlockSlotDescriptor {
                    slot_id: "SYN-SLOT-DAILY".into(),
                    kind: UnlockSlotKind::PractitionerDevice,
                    protector_version: 1,
                },
                UnlockSlotDescriptor {
                    slot_id: "SYN-SLOT-ESCROW".into(),
                    kind: UnlockSlotKind::OrganizationalRecovery,
                    protector_version: 1,
                },
            ],
        }
    }

    #[test]
    fn separate_practitioner_and_recovery_custodian() {
        let mut p = policy();
        assert_eq!(validate_recovery_policy(&p), Ok(()));
        p.recovery_custodian_principal_id = p.practitioner_principal_id.clone();
        assert_eq!(
            validate_recovery_policy(&p),
            Err(RecoveryPolicyError::SelfCustodyNotAllowed)
        );
    }

    #[test]
    fn requires_two_independent_unlock_slot_types() {
        let mut p = policy();
        p.unlock_slots.pop();
        assert_eq!(
            validate_recovery_policy(&p),
            Err(RecoveryPolicyError::MissingOrganizationRecoverySlot)
        );
        let mut p = policy();
        p.unlock_slots.remove(0);
        assert_eq!(
            validate_recovery_policy(&p),
            Err(RecoveryPolicyError::MissingPractitionerSlot)
        );
    }

    #[test]
    fn rejects_duplicate_and_empty_slot_identifiers() {
        let mut p = policy();
        p.unlock_slots[1].slot_id = p.unlock_slots[0].slot_id.clone();
        assert_eq!(
            validate_recovery_policy(&p),
            Err(RecoveryPolicyError::DuplicateSlotId)
        );
        let mut p = policy();
        p.unlock_slots[0].slot_id.clear();
        assert_eq!(
            validate_recovery_policy(&p),
            Err(RecoveryPolicyError::MissingIdentity)
        );
    }

    #[test]
    fn no_runtime_decryption_capability_is_exposed() {
        let p = policy();
        let metadata = serde_json::to_string(&p).expect("policy should serialize");
        assert!(!metadata.contains("secret"));
        assert!(!metadata.contains("private_key"));
        assert!(!metadata.contains("plaintext"));
    }
}
