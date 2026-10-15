use serde::Deserialize;
use soar_core::screening::{
    AdultReferralScreen, EvidenceKind, EvidenceSource, EvidenceStatus, Finding,
    FunctionalDomain, FunctionalFinding, HumanReview, ServiceDecision,
};

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
enum UiStatus {
    Documented,
    Reported,
    Unknown,
    NotSupported,
}

impl From<UiStatus> for EvidenceStatus {
    fn from(value: UiStatus) -> Self {
        match value {
            UiStatus::Documented => Self::Documented,
            UiStatus::Reported => Self::Reported,
            UiStatus::Unknown => Self::Unknown,
            UiStatus::NotSupported => Self::NotSupported,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
enum UiEvidenceKind {
    ApplicantReport,
    ClinicianRecord,
    HospitalRecord,
    WorkHistory,
    AdvocateObservation,
    Other,
}
impl From<UiEvidenceKind> for EvidenceKind {
    fn from(value: UiEvidenceKind) -> Self {
        match value {
            UiEvidenceKind::ApplicantReport => Self::ApplicantReport,
            UiEvidenceKind::ClinicianRecord => Self::ClinicianRecord,
            UiEvidenceKind::HospitalRecord => Self::HospitalRecord,
            UiEvidenceKind::WorkHistory => Self::WorkHistory,
            UiEvidenceKind::AdvocateObservation => Self::AdvocateObservation,
            UiEvidenceKind::Other => Self::Other,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
enum UiFunctionalDomain {
    Physical,
    Cognitive,
    Social,
    Adaptation,
    AttendanceAndPersistence,
}
impl From<UiFunctionalDomain> for FunctionalDomain {
    fn from(value: UiFunctionalDomain) -> Self {
        match value {
            UiFunctionalDomain::Physical => Self::Physical,
            UiFunctionalDomain::Cognitive => Self::Cognitive,
            UiFunctionalDomain::Social => Self::Social,
            UiFunctionalDomain::Adaptation => Self::Adaptation,
            UiFunctionalDomain::AttendanceAndPersistence => Self::AttendanceAndPersistence,
        }
    }
}

#[derive(Deserialize)]
struct UiFinding {
    status: UiStatus,
    rationale: String,
    source_references: Vec<String>,
}
impl From<UiFinding> for Finding {
    fn from(v: UiFinding) -> Self {
        Self { status: v.status.into(), rationale: v.rationale, source_references: v.source_references }
    }
}
#[derive(Deserialize)]
struct UiSource {
    reference: String,
    kind: UiEvidenceKind,
    summary: String,
}
impl From<UiSource> for EvidenceSource {
    fn from(v: UiSource) -> Self {
        Self { reference: v.reference, kind: v.kind.into(), summary: v.summary }
    }
}
#[derive(Deserialize)]
struct UiFunctionalFinding {
    domain: UiFunctionalDomain,
    finding: UiFinding,
}
impl From<UiFunctionalFinding> for FunctionalFinding {
    fn from(v: UiFunctionalFinding) -> Self {
        Self { domain: v.domain.into(), finding: v.finding.into() }
    }
}
#[derive(Deserialize)]
struct UiScreen {
    medically_determinable_impairment: UiFinding,
    severe_functional_impact: UiFinding,
    expected_duration: UiFinding,
    inability_to_sustain_work: UiFinding,
    functional_findings: Vec<UiFunctionalFinding>,
    sources: Vec<UiSource>,
}
impl From<UiScreen> for AdultReferralScreen {
    fn from(v: UiScreen) -> Self {
        Self {
            medically_determinable_impairment: v.medically_determinable_impairment.into(),
            severe_functional_impact: v.severe_functional_impact.into(),
            expected_duration: v.expected_duration.into(),
            inability_to_sustain_work: v.inability_to_sustain_work.into(),
            functional_findings: v.functional_findings.into_iter().map(Into::into).collect(),
            sources: v.sources.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "PascalCase")]
enum UiTriage {
    AdvanceForReview,
    FurtherAssessment,
    ReviewServiceFit,
}
#[derive(serde::Serialize)]
struct UiRecommendation {
    status: UiTriage,
    reasons: Vec<String>,
}

#[tauri::command]
fn evaluate_screen(screen: UiScreen) -> Result<UiRecommendation, String> {
    let result = AdultReferralScreen::from(screen)
        .recommend()
        .map_err(|error| format!("Screening evidence needs correction: {error:?}"))?;
    let status = match result.status {
        soar_core::TriageStatus::AdvanceForReview => UiTriage::AdvanceForReview,
        soar_core::TriageStatus::FurtherAssessment => UiTriage::FurtherAssessment,
        soar_core::TriageStatus::ReviewServiceFit => UiTriage::ReviewServiceFit,
    };
    Ok(UiRecommendation { status, reasons: result.reasons })
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
enum UiDecision {
    AcceptForIntake,
    RequestMoreEvidence,
    ReferElsewhere,
}
#[derive(Deserialize)]
struct UiReview {
    reviewer_id: String,
    decision: UiDecision,
    rationale: String,
}
#[tauri::command]
fn validate_human_review(review: UiReview) -> Result<(), String> {
    let decision = match review.decision {
        UiDecision::AcceptForIntake => ServiceDecision::AcceptForIntake,
        UiDecision::RequestMoreEvidence => ServiceDecision::RequestMoreEvidence,
        UiDecision::ReferElsewhere => ServiceDecision::ReferElsewhere,
    };
    HumanReview { reviewer_id: review.reviewer_id, decision, rationale: review.rationale }
        .validate()
        .map_err(str::to_string)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![evaluate_screen, validate_human_review])
        .run(tauri::generate_context!())
        .expect("error starting SOAR Desk");
}
