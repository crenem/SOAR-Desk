//! Framework-neutral models for SOAR Desk.
//!
//! This library does **not** determine SSA eligibility and does not automate
//! denial of SOAR services. Its screening status identifies what human review
//! or additional evidence may be appropriate.

/// Screening facts must retain their provenance in the case management layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvidenceStatus {
    Documented,
    Reported,
    Unknown,
    NotSupported,
}

/// Work-related functional areas, considered individually and in combination.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FunctionalDomain {
    Physical,
    Cognitive,
    Social,
    Adaptation,
    AttendanceAndPersistence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriageStatus {
    /// Potentially appropriate for a comprehensive SOAR intake.
    AdvanceForReview,
    /// Missing or conflicting facts warrant evidence development.
    FurtherAssessment,
    /// May be outside intensive SOAR program criteria; requires human review.
    ReviewServiceFit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AdultReferralScreen {
    pub medically_determinable_impairment: EvidenceStatus,
    pub severe_functional_impact: EvidenceStatus,
    pub expected_duration: EvidenceStatus,
    pub inability_to_sustain_work: EvidenceStatus,
}

/// A deliberately conservative triage suggestion, **not** an SSA determination.
/// No automatic rejection is possible through this function.
pub fn triage(screen: &AdultReferralScreen) -> TriageStatus {
    use EvidenceStatus::{Documented, NotSupported, Reported, Unknown};
    let values = [
        screen.medically_determinable_impairment,
        screen.severe_functional_impact,
        screen.expected_duration,
        screen.inability_to_sustain_work,
    ];
    if values.contains(&Unknown) || values.contains(&Reported) {
        TriageStatus::FurtherAssessment
    } else if values.contains(&NotSupported) {
        TriageStatus::ReviewServiceFit
    } else if values.iter().all(|value| *value == Documented) {
        TriageStatus::AdvanceForReview
    } else {
        TriageStatus::FurtherAssessment
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(value: EvidenceStatus) -> AdultReferralScreen {
        AdultReferralScreen {
            medically_determinable_impairment: value,
            severe_functional_impact: value,
            expected_duration: value,
            inability_to_sustain_work: value,
        }
    }

    #[test]
    fn documented_referral_advances_for_human_review() {
        assert_eq!(
            triage(&screen(EvidenceStatus::Documented)),
            TriageStatus::AdvanceForReview
        );
    }

    #[test]
    fn uncertain_referral_requests_further_assessment() {
        assert_eq!(
            triage(&screen(EvidenceStatus::Unknown)),
            TriageStatus::FurtherAssessment
        );
    }

    #[test]
    fn clearly_unsupported_referral_is_not_automatically_rejected() {
        assert_eq!(
            triage(&screen(EvidenceStatus::NotSupported)),
            TriageStatus::ReviewServiceFit
        );
    }

    #[test]
    fn mixed_support_and_missing_information_requires_assessment() {
        let mut referral = screen(EvidenceStatus::Documented);
        referral.expected_duration = EvidenceStatus::Unknown;
        assert_eq!(triage(&referral), TriageStatus::FurtherAssessment);
    }
}
