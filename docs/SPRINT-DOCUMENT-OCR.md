# Sprint: Document Intake, Local OCR & Integrated Laya Classification

**Status:** Planned; not yet implemented. **Synthetic documents only** until security approval.

## Objective
Build a privacy-preserving source-document intake pipeline for SOAR Desk that converts scanned and text-based PDF evidence into page-addressable text and integrated reviewable classification suggestions. It must function with AI disabled.

## Sprint backlog
- [ ] Add `crates/soar-documents` with a parser/engine abstraction, document IDs, checksums, processing state, per-page text, and source provenance.
- [ ] Implement file import in the Tauri desktop UI. Restrict initial accepted types to PDF, PNG, JPEG, TIFF; apply MIME/file signature checks, size/page caps, and safe error handling.
- [ ] Extract embedded PDF text using a maintained Rust parser or carefully wrapped local PDF utility; preserve page numbers and distinguish text-only, scanned, and mixed-content pages.
- [ ] Add local OCR using **Tesseract OCR 5** and **Leptonica**, with English language data (`tesseract-ocr-eng`), run by a controlled local process. Use a local PDF rasterizer such as **Poppler** (`pdftoppm`) only where pages need rendering for OCR.
- [ ] Provide documented Linux ARM64 (Ubuntu WSL2), Windows ARM64, and x64 dependency installation/detection; do not bundle unreviewed binaries.
- [ ] Implement `ocr_disabled`, `ocr_needed`, `ocr_complete`, and `ocr_failed` states; report OCR engine/version, language, confidence where supplied, and parse warnings.
- [ ] Display source PDF/image next to extracted text with page-level highlighting, manual corrections, and source-linked findings.
- [ ] Add an **integrated**, locally executed Laya classifier adapter (feature flag / opt-in) for document category and candidate SOAR functional-domain tags; no inference request to external services.
- [ ] Check Laya **code, weights, dependencies, and ARM64 support** separately before enabling integration; log model name/version, question schema, and confidence and require explicit reviewer confirmation.
- [ ] Exercise a small fully synthetic corpus (born-digital PDF, image-only PDF, mixed PDF, rotated/skewed scan, low quality scan, blank pages, malicious/oversized input).
- [ ] Add CI tests for parser and evidence provenance without network model downloads; separate opt-in inference integration tests.

## Suggested system dependencies (Ubuntu 24.04 ARM64)
```bash
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-eng liblept5 libtesseract-dev poppler-utils
tesseract --version
pdftoppm -v
```

Python 3.10+ in an isolated environment will be investigated for the integrated Laya adapter. Installing its weights is a **separate explicit opt-in action** and must not be required to use OCR. No real client information may be used to benchmark models.

## Processing contract
`Import -> signature/type check -> hash -> safe PDF/image parser -> per-page embedded text -> OCR if necessary -> structured page text -> integrated local classifier -> human approval -> candidate evidence links`.

Proposed record fields: `document_id`, `sha256`, `media_type`, `page_number`, `text`, `extraction_method`, `ocr_version`, `confidence`, `warnings`, `source_locator`, `review_status`, `reviewer_id`, `model_id`, `model_version`.

No classification, OCR output, or generated clinical finding should be treated as factual until reviewed against the original source.

## Non-negotiable human-in-the-loop workflow
1. Laya output is an immutable **proposal** with model ID, model revision, confidence, source document/page/span, and question schema.
2. Each proposal remains in `PendingHumanReview` until an authenticated reviewer explicitly accepts, edits, or rejects it.
3. Accepted findings retain both original AI output and human corrections; a later model rerun must never overwrite the approved finding.
4. Case-level program decisions require an independent signed reviewer action and recorded rationale; Laya cannot set the decision.
5. Low-confidence, unsupported, contradictory, or incomplete findings are routed for further review. No automatic service denial is permitted.
6. UI distinguishes `Proposed`, `HumanVerified`, `Rejected`, and `NeedsMoreEvidence` states, including accessible review controls.
7. No raw clinical documents or model prompts leave the device; no cloud fallback.

## Out of scope
- Automated SSA adjudication, disability-score predictions, or applicant rejections.
- Automatic FAST MSR drafting from unverified OCR.
- Cloud upload, telemetry, hosted inference, or third-party data transmission.
- Production PHI, SSNs, identifying client documents, or permanent unencrypted imports.

## Acceptance criteria
1. Linux ARM64 synthetic scanned PDF successfully yields page-linked OCR text with no cloud request.
2. Text PDF avoids unnecessary OCR, and mixed pages OCR only where appropriate.
3. Broken/unsupported input fails safely with user-facing diagnostics.
4. Laya classification is a standard supported feature. The entire intake and OCR feature continues in a visibly degraded mode if the inference runtime or model is unavailable.
5. Every potential finding maintains a pointer to the original document and page and requires reviewer approval.
6. Disabled/synthetic-only warnings remain visible until security gates are completed.
