# Native Windows SOAR Desk — implementation and delivery plan

**Release goal:** a single downloadable `SOAR-Desk-Setup.exe` that installs a Rust/Slint Windows desktop application with no WSL, Tauri, React, Node.js or Python runtime dependencies. No manual approvals for ordinary implementation choices. Never replace a functioning release or delete user data before verification.

## M1 Native foundation
- Rust-only app and Slint minimalist document-first UI, responsive compact 2–3 column typed controls.
- SQLite is authoritative for cases, extracted facts, provenance, versioned artifacts, form drafts and AI jobs.
- Revision-aware autosave on blur/idle, inline saving/error state, undo/history, keyboard support.
- **Gate:** case creation, reopen and autosave tests pass on Windows.

## M2 Document intake and native OCR
- File picker / drag and drop; PDF, image, text handling with page boundaries and hash verification.
- Preserve immutable originals and per-page extraction; Windows-native OCR for scanned sources.
- **Gate:** text, scanned, damaged, oversized, duplicate and interrupted imports.

## M3 Local AI pipeline
- First pass extracts typed JSON identity, DOB, diagnosis codes, work history, findings and citations.
- Second pass streams page-grounded human-readable summary; save final version without deleting prior runs.
- Windows-native local inference process with model install/acquisition; optional CUDA and ARM64 support as proven.
- **Gate:** Jane Doe synthetic PDF extraction/summary and chunking test.

## M4 Case synthesis
- Keep each document's artifacts; new uploads trigger versioned consolidated evidence synthesis.
- Generate balanced supporting/contrary/insufficient disability narrative with human-reviewable citations.
- **Gate:** conflicts, missing data and unsupported conclusions explicitly identified.

## M5 SSA draft preparation
- Schema-driven sourced fields, typed native controls, user corrections overriding AI suggestions.
- Initial SSA-3368 / SSA-16 unsigned draft preparation with exact edition/field mapping.
- **Gate:** field-by-field sample review; never fabricate signatures or claim SSA adjudication.

## M6 Secure migration and recovery
- Encrypt database, originals, exports and backups as appropriate; local lock/recovery, audit and migrations.
- Restore existing cases without deleting original storage; tested crash, disk failure, backup and upgrade behavior.
- **Gate:** security review before real PHI handling.

## M7 Windows release engineering
- CI tests and builds Windows x86-64 executable, ARM64 native when supported; Inno Setup installer.
- Downloadable artifact, checksum, release notes, install/uninstall/upgrade tests. Signing requires valid credentials.
- **Gate:** verified setup exe and actual Windows smoke test, not merely passing source checks.

## Definition of done
A user installs one exe and can create a case, upload multiple documents, see both AI passes with a streaming summary, reopen all artifacts, generate reviewed disability narrative and editable SSA drafts; all edits persist without Save buttons. No WSL or terminal.

## Delivery limitation
Local GGUF models are multi-GB; a one-time licensed model download may be necessary after installer launch. This must be integrated and tested rather than asking users to set up a server manually. CI cannot stand in for Windows installation/security acceptance.

**Progress (Oct 20, 2026):** requirements committed, SQLite store scaffold committed. Native GUI and release pipeline in progress; completion and real-PHI authorization not yet established.
