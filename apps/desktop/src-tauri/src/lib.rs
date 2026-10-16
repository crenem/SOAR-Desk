mod vault_commands;
mod ssa_template_commands;

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


fn local_case_review_ack(synthetic:bool,local:bool)->Result<(),String>{
    if (synthetic && !local) || (!synthetic && local) {Ok(())}
    else {Err("Select and explicitly acknowledge either fictional training or restricted local processing.".into())}
}
#[derive(Deserialize)]
struct DocumentRequest {
    path: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[tauri::command]
fn extract_synthetic_document(request: DocumentRequest) -> Result<soar_documents::ExtractedDocument, String> {
    local_case_review_ack(request.synthetic_confirmed,request.local_risk_acknowledged)?;
    soar_documents::extract(std::path::Path::new(&request.path))
}

#[derive(Deserialize)]
struct ClassifyRequest {
    text: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[tauri::command]
fn classify_synthetic_text(request: ClassifyRequest) -> Result<serde_json::Value, String> {
    use std::{io::Write, process::{Command, Stdio}};
    local_case_review_ack(request.synthetic_confirmed,request.local_risk_acknowledged)?;
    if request.text.len() > 80_000 { return Err("Text exceeds development limit".into()); }
    let worker = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workers/laya_worker.py");
    let python = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../.venv-laya/bin/python");
    if !python.exists() { return Err("Laya is unavailable. Create .venv-laya as described in docs/OCR-QUICKSTART.md".into()); }
    let mut child = Command::new(python).arg(worker).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .env("HF_HUB_OFFLINE", "1").env("TRANSFORMERS_OFFLINE", "1")
        .spawn().map_err(|e| e.to_string())?;
    let payload = serde_json::json!({"text": request.text});
    if let Some(mut stdin) = child.stdin.take() { stdin.write_all(payload.to_string().as_bytes()).map_err(|e| e.to_string())?; }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|e| format!("Laya response: {e}"))?;
    if !output.status.success() { return Err(parsed.get("error").and_then(|v| v.as_str()).unwrap_or("Laya classification failed").to_string()); }
    Ok(parsed)
}


#[derive(Deserialize)]
struct QwenRequest {
    text: String,
    synthetic_confirmed: bool,
    #[serde(default)]
    local_risk_acknowledged: bool,
}
#[tauri::command]
fn extract_qwen_candidates(request: QwenRequest) -> Result<serde_json::Value, String> {
    use std::{io::Write, process::{Command, Stdio}};
    local_case_review_ack(request.synthetic_confirmed,request.local_risk_acknowledged)?;
    if request.text.is_empty() || request.text.len() > 5000 { return Err("Qwen passage must contain 1–5,000 characters".into()); }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let worker = root.join("workers/qwen_worker.py");
    // Prefer the existing virtual environment. It supplies a Python interpreter, not an online API.
    let venv_python = root.join(".venv-laya/bin/python");
    let python = if venv_python.exists() { venv_python.to_string_lossy().to_string() } else { "python3".into() };
    let mut child = Command::new(python).arg(worker)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("Qwen worker startup: {e}"))?;
    let payload = serde_json::json!({"text":request.text});
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(payload.to_string().as_bytes()).map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Qwen worker returned an invalid response: {e}"))?;
    if !output.status.success() {
        return Err(parsed.get("error").and_then(|v| v.as_str()).unwrap_or("Qwen worker failed").to_string());
    }
    Ok(parsed)
}

/// Explicit, bounded export of a synthetic-only application draft.
#[derive(Deserialize)]
struct SyntheticDraftRequest {
    path: String,
    content: String,
    synthetic_confirmed: bool,
}

fn validate_draft_json(content: &str) -> Result<(), String> {
    if content.is_empty() || content.len() > 2_000_000 {
        return Err("Synthetic draft must be 1–2,000,000 bytes".into());
    }
    let json: serde_json::Value =
        serde_json::from_str(content).map_err(|_| "Draft must contain valid JSON".to_string())?;
    if json.get("file_kind").and_then(|v| v.as_str()) != Some("soar-desk-synthetic-application-draft")
        || json.get("schema_version").and_then(|v| v.as_u64()) != Some(1)
        || json.get("synthetic_only").and_then(|v| v.as_bool()) != Some(true)
        || json.pointer("/summary/ready_for_ssa_submission").and_then(|v| v.as_bool()) != Some(false)
    {
        return Err("Not a versioned synthetic, non-submittable SOAR Desk draft".into());
    }
    let case = json.get("case_reference").and_then(|v| v.as_str()).unwrap_or("");
    if case.len() > 80 || !case.starts_with("SYN-")
        || !case.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Draft case reference must be explicitly synthetic".into());
    }
    if !json.get("forms").is_some_and(|v| v.is_array())
        || !json.get("evidence_register").is_some_and(|v| v.is_array())
        || !json.get("submission_log").is_some_and(|v| v.is_object())
    {
        return Err("Draft package is missing core sections".into());
    }
    Ok(())
}

#[tauri::command]
fn export_synthetic_draft(request: SyntheticDraftRequest) -> Result<String, String> {
    use std::{fs::OpenOptions, io::Write, path::Path};
    if !request.synthetic_confirmed {
        return Err("Explicit fictional-data confirmation is required".into());
    }
    validate_draft_json(&request.content)?;
    let target = Path::new(&request.path);
    if !target.is_absolute() || target.extension().and_then(|e| e.to_str()) != Some("json") {
        return Err("Select an absolute local JSON file destination".into());
    }
    // Deliberately no overwrites. Only a person invoking the save dialog chooses
    // the destination; the command does not fetch, transmit, or automatically save.
    let mut file = OpenOptions::new().write(true).create_new(true).open(target)
        .map_err(|e| format!("Cannot create new draft file (existing files are never overwritten): {e}"))?;
    if let Err(err) = file.write_all(request.content.as_bytes()).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = std::fs::remove_file(target);
        return Err(format!("Unable to finish the synthetic draft export: {err}"));
    }
    Ok(target.display().to_string())
}

#[cfg(test)]
mod export_draft_tests {
    use super::validate_draft_json;

    fn draft() -> String {
        serde_json::json!({
            "file_kind":"soar-desk-synthetic-application-draft",
            "schema_version":1,
            "synthetic_only":true,
            "case_reference":"SYN-JANE-001",
            "summary":{"ready_for_ssa_submission":false},
            "forms":[],
            "evidence_register":[],
            "submission_log":{"records":[],"events":[]}
        }).to_string()
    }

    #[test]
    fn accepts_only_explicit_synthetic_package() {
        assert!(validate_draft_json(&draft()).is_ok());
        let mut json:serde_json::Value=serde_json::from_str(&draft()).unwrap();
        json["summary"]["ready_for_ssa_submission"]=serde_json::Value::Bool(true);
        assert!(validate_draft_json(&json.to_string()).is_err());
        json["summary"]["ready_for_ssa_submission"]=serde_json::Value::Bool(false);
        json["case_reference"]=serde_json::Value::String("LIVE-001".to_string());
        assert!(validate_draft_json(&json.to_string()).is_err());
    }

    #[test]
    fn rejects_non_json_and_missing_fields() {
        assert!(validate_draft_json("<xml/>").is_err());
        assert!(validate_draft_json("{}").is_err());
    }
}

/// Populate a local review copy of the original SSA-16 with synthetic fields.
/// No network, signatures, SSA receipts, arbitrary document paths or overwrite.
#[derive(Deserialize)]
struct SyntheticPdfRequest {
    output_path: String,
    package: serde_json::Value,
    synthetic_confirmed: bool,
}
#[tauri::command]
fn export_synthetic_ssa16_pdf(request: SyntheticPdfRequest) -> Result<serde_json::Value, String> {
    use std::{
        io::Write,
        path::{Path, PathBuf},
        process::{Command, Stdio},
    };
    if !request.synthetic_confirmed {
        return Err("Confirm fictional training data before exporting a PDF.".into());
    }
    if request.package.get("synthetic_only").and_then(|v| v.as_bool()) != Some(true)
        || request
            .package
            .pointer("/summary/ready_for_ssa_submission")
            .and_then(|v| v.as_bool())
            != Some(false)
    {
        return Err("This export accepts only non-submittable synthetic drafts.".into());
    }
    let output = Path::new(&request.output_path);
    if !output.is_absolute() || output.extension().and_then(|e| e.to_str()) != Some("pdf") {
        return Err("Choose an absolute .pdf output destination.".into());
    }
    if output.exists() {
        return Err("Existing PDF files cannot be overwritten; choose a new name.".into());
    }
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let source = root.join(".local/ssa-templates/ssa-16-bk.pdf");
    if !source.is_file() {
        return Err(
            "Official SSA-16 template not cached. Run: bash scripts/prepare-ssa16-template.sh"
                .into(),
        );
    }
    let python = root.join(".venv-laya/bin/python");
    if !python.exists() {
        return Err("Local Python environment unavailable. Relaunch SOAR Desk.".into());
    }
    let worker = root.join("workers/ssa_pdf_worker.py");
    let mut child = Command::new(python)
        .arg(worker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .spawn()
        .map_err(|e| format!("Could not start the local PDF worker: {e}"))?;
    let payload = serde_json::json!({
        "output_path": request.output_path,
        "template_path": source,
        "synthetic_confirmed": true,
        "package": request.package,
    });
    if payload.to_string().len() > 2_000_000 {
        return Err("Synthetic PDF payload exceeds the 2 MB limit.".into());
    }
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.to_string().as_bytes())
            .map_err(|e| format!("Cannot send synthetic data to local PDF worker: {e}"))?;
    }
    let response = child.wait_with_output().map_err(|e| e.to_string())?;
    if !response.status.success() {
        let details = String::from_utf8_lossy(&response.stderr);
        return Err(format!("PDF review copy could not be generated: {}", details.trim()));
    }
    let result: serde_json::Value = serde_json::from_slice(&response.stdout)
        .map_err(|e| format!("Invalid PDF worker response: {e}"))?;
    if result.get("ready_for_ssa_submission").and_then(|v| v.as_bool()) != Some(false) {
        return Err("PDF worker must never claim SSA submission readiness.".into());
    }
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![evaluate_screen, validate_human_review, extract_synthetic_document, classify_synthetic_text, extract_qwen_candidates, export_synthetic_draft, export_synthetic_ssa16_pdf, vault_commands::create_synthetic_vault, vault_commands::open_synthetic_vault, vault_commands::backup_synthetic_vault, vault_commands::recover_synthetic_vault, vault_commands::autosave_synthetic_case, vault_commands::synthetic_autosave_status, vault_commands::lock_synthetic_autosave, ssa_template_commands::ssa16_template_status, ssa_template_commands::install_ssa16_template])
        .run(tauri::generate_context!())
        .expect("error starting SOAR Desk");
}
