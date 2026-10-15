# Roadmap

## 0.1.0 — Open foundation and referral screening
- [x] Open-source charter and licensing
- [x] Rust workspace and initial triage types
- [x] Synthetic-only test fixtures and CI baseline
- [x] Implement evidence-linked screening data model and reviewable recommendation engine
- [x] Specify human service-decision record
- [ ] Validate referral-screening workflow with practitioners
- [ ] Catalog SSA forms with version and authority metadata
- [ ] Agree security threat model and accessibility acceptance criteria

## 0.2.0 — Safe desktop alpha
- [x] Add Tauri 2 desktop shell and connected guided screening UI (in-memory synthetic-only preview)
- [x] Provide evidence editor, review summary, and Tauri IPC bridge
- [ ] Build encrypted local storage and locked-screen behavior
- [ ] Create auditable case changes and encrypted backup/restore
- [ ] Independent security and accessibility reviews

## Next sprint — Document import, OCR & integrated local Laya classification
- [ ] Implement local PDF/image import with per-page provenance and file validation
- [ ] Install/detect Tesseract 5, Leptonica, and Poppler rendering dependencies
- [ ] Implement embedded-text extraction and selective OCR of scanned pages
- [ ] Add side-by-side source review and correction for synthetic documents
- [ ] Integrate offline Laya classification as a first-class module with mandatory human approval
- [ ] Test on fully synthetic documents, including malformed and low-quality files
- [ ] See [sprint specification](SPRINT-DOCUMENT-OCR.md)

## 0.3.0 — Evidence workflow
- [ ] Provider contact/request queue
- [ ] Form/version tracker and verified deadlines
- [ ] Evidence source linkage and MSR editing
- [ ] Synthetic end-to-end workflows

## Future
- [ ] Adult appeals workflows
- [ ] Optional self-hosted nonprofit collaboration
- [ ] Pluggable state-specific protocols
- [ ] Report exports and privacy-preserving aggregate metrics
