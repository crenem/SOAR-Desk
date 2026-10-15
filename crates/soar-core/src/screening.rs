//! Structured, reviewable adult-referral screening; no eligibility determinations.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvidenceStatus {
    Documented,
    Reported,
    Unknown,
    NotSupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FunctionalDomain {
    Physical,
    Cognitive,
    Social,
    Adaptation,
    AttendanceAndPersistence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvidenceKind {
    ApplicantReport,
    ClinicianRecord,
    HospitalRecord,
    WorkHistory,
    AdvocateObservation,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvidenceSource {
    /// Case-local reference; no raw documents, names or PHI in test fixtures.
    pub reference: String,
    pub kind: EvidenceKind,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub status: EvidenceStatus,
    /// Human-readable rationale, including why evidence is missing or conflicting.
    pub rationale: String,
    pub source_references: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FunctionalFinding {
    pub domain: FunctionalDomain,
    pub finding: Finding,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdultReferralScreen {
    pub medically_determinable_impairment: Finding,
    pub severe_functional_impact: Finding,
    pub expected_duration: Finding,
    pub inability_to_sustain_work: Finding,
    pub functional_findings: Vec<FunctionalFinding>,
    pub sources: Vec<EvidenceSource>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriageStatus {
    AdvanceForReview,
    FurtherAssessment,
    ReviewServiceFit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreeningRecommendation {
    pub status: TriageStatus,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    BlankRationale(&'static str),
    MissingSource(String),
    DuplicateSourceReference(String),
    BlankSourceReference,
    BlankSourceSummary(String),
}

impl AdultReferralScreen {
    /// Validate basic evidence traceability; this does not validate clinical truth.
    pub fn validate(&self) -> Result<(), ValidationError> {
        use std::collections::HashSet;
        let mut refs = HashSet::new();
        for source in &self.sources {
            if source.reference.trim().is_empty() {
                return Err(ValidationError::BlankSourceReference);
            }
            if source.summary.trim().is_empty() {
                return Err(ValidationError::BlankSourceSummary(source.reference.clone()));
            }
            if !refs.insert(source.reference.as_str()) {
                return Err(ValidationError::DuplicateSourceReference(source.reference.clone()));
            }
        }
        let required = [
            ("impairment", &self.medically_determinable_impairment),
            ("functional impact", &self.severe_functional_impact),
            ("duration", &self.expected_duration),
            ("work capacity", &self.inability_to_sustain_work),
        ];
        for (field, finding) in required {
            validate_finding(finding, field, &refs)?;
        }
        for finding in &self.functional_findings {
            validate_finding(&finding.finding, "functional domain", &refs)?;
        }
        Ok(())
    }

    /// Always returns a recommendation for **human review**, never a denial.
    pub fn recommend(&self) -> Result<ScreeningRecommendation, ValidationError> {
        self.validate()?;
        let required = [
            ("Impairment", self.medically_determinable_impairment.status),
            ("Functional impact", self.severe_functional_impact.status),
            ("Duration", self.expected_duration.status),
            ("Work capacity", self.inability_to_sustain_work.status),
        ];
        let uncertain: Vec<_> = required.iter().filter(|(_, s)| matches!(s, EvidenceStatus::Unknown | EvidenceStatus::Reported)).map(|(label, _)| (*label).to_string()).collect();
        let unsupported: Vec<_> = required.iter().filter(|(_, s)| *s == EvidenceStatus::NotSupported).map(|(label, _)| (*label).to_string()).collect();
        let (status, reasons) = if !uncertain.is_empty() {
            (TriageStatus::FurtherAssessment, vec![format!("Further evidence needed for: {}", uncertain.join(", "))])
        } else if !unsupported.is_empty() {
            (TriageStatus::ReviewServiceFit, vec![format!("Review program fit and available evidence concerning: {}", unsupported.join(", "))])
        } else {
            (TriageStatus::AdvanceForReview, vec!["Required screening domains are documented; a reviewer must assess the case in context".to_string()])
        };
        Ok(ScreeningRecommendation { status, reasons })
    }
}

fn validate_finding(finding: &Finding, label: &'static str, refs: &std::collections::HashSet<&str>) -> Result<(), ValidationError> {
    if finding.rationale.trim().is_empty() {
        return Err(ValidationError::BlankRationale(label));
    }
    for reference in &finding.source_references {
        if !refs.contains(reference.as_str()) {
            return Err(ValidationError::MissingSource(reference.clone()));
        }
    }
    Ok(())
}

/// Human action is separate from algorithmic screening.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceDecision {
    AcceptForIntake,
    RequestMoreEvidence,
    ReferElsewhere,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HumanReview {
    pub reviewer_id: String,
    pub decision: ServiceDecision,
    pub rationale: String,
}

impl HumanReview {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.reviewer_id.trim().is_empty() || self.rationale.trim().is_empty() {
            return Err("Reviewer identity and documented rationale are required");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn finding(status: EvidenceStatus) -> Finding {
        Finding { status, rationale: "Synthetic screening observation".into(), source_references: vec!["SYN-001".into()] }
    }
    fn screen(status: EvidenceStatus) -> AdultReferralScreen {
        AdultReferralScreen {
            medically_determinable_impairment: finding(status),
            severe_functional_impact: finding(status),
            expected_duration: finding(status),
            inability_to_sustain_work: finding(status),
            functional_findings: vec![FunctionalFinding { domain: FunctionalDomain::Cognitive, finding: finding(status) }],
            sources: vec![EvidenceSource { reference: "SYN-001".into(), kind: EvidenceKind::ApplicantReport, summary: "Entirely fictitious example".into() }],
        }
    }
    #[test]
    fn documented_facts_go_to_human_review() {
        assert_eq!(screen(EvidenceStatus::Documented).recommend().unwrap().status, TriageStatus::AdvanceForReview);
    }
    #[test]
    fn reported_only_requires_more_assessment() {
        assert_eq!(screen(EvidenceStatus::Reported).recommend().unwrap().status, TriageStatus::FurtherAssessment);
    }
    #[test]
    fn unsupported_facts_are_not_automatic_denials() {
        assert_eq!(screen(EvidenceStatus::NotSupported).recommend().unwrap().status, TriageStatus::ReviewServiceFit);
    }
    #[test]
    fn missing_source_fails_validation() {
        let mut s = screen(EvidenceStatus::Documented);
        s.medically_determinable_impairment.source_references.push("missing".into());
        assert!(matches!(s.validate(), Err(ValidationError::MissingSource(_))));
    }
    #[test]
    fn duplicate_source_fails_validation() {
        let mut s = screen(EvidenceStatus::Documented);
        s.sources.push(s.sources[0].clone());
        assert!(matches!(s.validate(), Err(ValidationError::DuplicateSourceReference(_))));
    }
    #[test]
    fn review_requires_identity_and_rationale() {
        let r = HumanReview { reviewer_id: String::new(), decision: ServiceDecision::ReferElsewhere, rationale: "Screening notes".into() };
        assert!(r.validate().is_err());
    }
}
