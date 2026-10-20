# SOAR Desk — Document-first rebuild contract

Status: target architecture; implementation work required.

## Product boundaries
One Windows desktop application (Tauri 2, React, Rust). No parallel application editions or alternative build entry points. Preserve existing case data during migration; remove obsolete UI and build configurations only after validating replacements. Offline-first inference via configurable GenieX endpoint.

## Primary workflow
1. Create/open case; drop one or more PDF/image documents.
2. Extract text with page boundaries; OCR image-only pages; store immutable original and extraction metadata (hash, timestamps, source page).
3. Pass 1: extract structured person and evidence data (name, DOB, diagnoses with ICD codes only when explicitly present, employment history, provider, dates, medications, objective findings, self-reported function). Return JSON schema; validate and retain evidence snippets/page citations. Do not infer codes as documented codes.
4. Pass 2: stream a complete human-readable summary with executive summary, clinical findings, diagnoses and evidence, functional limitations, treatment, chronology, contradictory/missing evidence, page citations. Persist streamed output as versioned Markdown artifact on completion, retaining interrupted runs separately.
5. Additional documents append new immutable originals, per-document extracted facts and summaries; do not overwrite earlier artifacts. Update case-level synthesis as a new version.
6. Generate a balanced disability-evidence narrative: supporting, contrary, insufficient evidence; duration, longitudinal evidence, functional effects and potential work capacity; clearly mark uncertainty and distinguish medical findings from SSA adjudication. Permit support / not supported / insufficient-evidence conclusions with user review.
7. Map verified extracted facts to SSA form fields where supported. Preview, edit, approve, then export. Never fabricate blanks, signatures, ICD codes, dates, or SSA eligibility decisions.

## Data model
Case(id, created_at); Document(id, case_id, sha256, filename, mime, imported_at, blob_path); PageText(document_id, page, text, method); Fact(id, document_id, type, value, status, source_page, quote, confidence); Artifact(id, case_id, document_id?, kind, version, created_at, status, markdown_path, source_document_ids); FormDraft(id, case_id, form_id, revision, values, provenance, approval_state); Narrative(id, case_id, version, conclusion, markdown_path, artifact_ids).

## Interface
Three-pane workspace: left case/document library; center streaming analysis and versioned summaries; right facts/provenance and action controls. Primary action: Upload documents. No mandatory five-step intake wizard. Use progress states Extracting / Pass 1 / Pass 2 streaming / Saved / Error with retry.

## Reliability
- Stream generation tokens over Tauri events with job and artifact IDs; cancellation and recovery.
- Token budget and document chunking; map/reduce for large documents.
- JSON schema validation with retry; preserve raw outputs for audit.
- Deduplicate by SHA-256 and ask before attaching duplicate to same case.
- Atomic artifact writes; no overwriting prior summaries.
- Synthetic fixture tests include Jane Doe hospital record: 5 pages, six discharge diagnoses, 80-foot assisted ambulation, A1c 9.4%, distinct self-report and observed limitations.
- End-to-end test: import document A, stream two passes, import document B, preserve A, create synthesis v2, map fields, export draft.
- Do not send records to remote services without explicit configuration and authorization.

## Acceptance criteria
A Windows desktop build opens directly to the document-first workspace; PDFs ingest and are analyzed twice; summary text visibly streams; artifacts survive restart and further uploads; narrative is generated from all preserved artifacts; SSA forms populate sourced fields and remain editable; tests and native Windows build pass.

## Migration
Retire old form-first screens, unused demo/synthetic-only gates, and redundant launch/build variants after a tested data-preserving migration. Keep only one supported desktop application, with ARM64 and x86-64 as architectures of the same product, not separate products.
