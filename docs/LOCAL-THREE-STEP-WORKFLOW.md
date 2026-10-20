# SOAR Desk — Local-first three-step application preparation

**Development status:** Implemented foundations + gaps as of October 20, 2026. All real data remain prohibited until independent authorization/security testing; **this is NOT a signed, complete, or SSA-submitted product**. Inference uses only configured loopback Qwen on the operator's machine, never cloud APIs. The previous Laya classifier is left installed for legacy experiments but **not called by the new document workflow**.

## Goal

Build an applicant-oriented process where the practitioner collects each canonical item once, inspects imported evidence, and prepares a complete externally reviewed SSA application packet. The target state has three stages:

### 1. Unified structured interview — implemented for existing partial SSA mapping

- Select SSI, SSDI, or both; enable conditional/optional form types only when necessary.
- Ask each canonical key once across mapped SSA-16, SSA-8000-BK, SSA-3368-BK, SSA-827, SSA-3369-BK and SSA-3373-BK. SSA-8001 remains reference-only; further conditional forms (1696/3380/821/820, appeals and other SSA requests) require scoping and modeling rather than being incorrectly treated as universally mandatory.
- Group questions by applicant identity, work, education, treatment, functional limitations, income/resources, household, signatures, and special case information; each question displays every *currently mapped* official form reference.
- Reuse one answer and repeating list (jobs, providers, conditions etc.) throughout form views. Preserve status (reported, verified, unknown, needs clarification), source references and the original applicant testimony.
- When the crosswalk finds competing conditional branches/types/options for one key, flag them for review; never silently collapse non-equivalent SSA questions.

**Official-form completeness audit tooling added:** `scripts/audit-ssa-source-forms.py` inventories printed text lines (including candidate numbered questions), widget IDs/types/positions, exact local PDF SHA-256 hashes and unreadable/scanned pages for the seven locally cached source forms. It does **not** automatically claim semantic equivalence or approve field mappings. After obtaining the blank SSA originals in the gitignored .local cache, use:

~~~bash
./scripts/fetch-ssa-templates.sh
python3 scripts/audit-ssa-source-forms.py --template-dir .local/ssa-templates
~~~

The generated `.local/ssa-templates/all-form-field-inventory.json` provides an explicit question/widget checklist for human field-by-field crosswalk completion. Missing templates return a nonzero status and no generated candidate mapping is considered complete.

**IMPORTANT:** The registry is only PARTIAL. This work does **not** constitute an every-question audit of the official PDFs, and the generated percentage is not SSA completeness.

### 2. Attached evidence → coherent Qwen JSON — first implementation completed

- Browse a local PDF/PNG/JPEG/TIFF; native extraction preserves document SHA-256, page index and OCR method. Limits remain 15 MiB / 25 pages in current local intake.
- Call `extract_qwen_document` (new Tauri Rust command) once per document. It invokes `workers/qwen_document_worker.py`; the worker uses existing on-device Qwen3 4B through Windows loopback GenieX where healthy or Ubuntu loopback llama.cpp CPU as fallback. No network endpoints except preconfigured 127.0.0.1.
- The worker divides extracted pages into context-bounded contiguous windows, not every isolated 1,100-character snippet, and merges every successful window into **one document JSON object** with schema version, source hash, model/backend, proposed summary, source page/offset, findings, interview field suggestions, unreadable pages, failures and **analysis_complete** status.
- Each proposed finding must include an exact input substring from that same page; invented quotations or wrong page references are discarded. Missing pages/windows are explicit and never treated as negative clinical evidence.
- Reviewer independently checks suggested facts and narrative source quotations against original pages before offering them to an **existing blank interview field**. The import screen never overwrites prior applicant statements and imported content enters case answers as **needs clarification**, not verified clinical truth.
- The original document can be encrypted into the case vault only via its existing SHA-256-checked attachment path. Raw model proposals remain local **in-memory session-only** until individually approved into answers; no silent hidden case-file write.

**Limits:** A single JSON object represents the entire processed source, but because Qwen3 4B has a limited actual runtime context window, long documents require multiple bounded model calls and local merge. Documents with OCR too poor to recover and context windows that fail produce conspicuously **incomplete** output. Never claim one unrestricted model pass or medically accurate extraction. For OCR quality, model performance and WSL CPU/NPU inference time, test using synthetic degraded sources.

### 3. Reviewed package assembly — in progress, NOT submission-ready

Current package screen provides form outline JSON for fictional cases, manually indexed evidence references, completion gaps and an explicitly **incomplete/unsigned** local SSA-16 PDF. The other form templates, all form fields, legal electronic signatures, validated printing and submission are not yet implemented. This stage must remain labelled **working/draft**, not ready for SSA.

**Release gate for future complete application assembly:**
1. Audit *every* numbered/subpart/checkbox and every conditional section of the current official edition of the required SSA forms, based on the selected program and current SSA instructions (forms may be requested later by SSA or DDS). Compare widgets against visual PDF page questions; capture evidence of approved mapping.
2. Write a machine-readable, edition-versioned crosswalk mapping every relevant field to the canonical applicant key or a justified form-specific key. Identify questions that look equivalent but differ legally (date of onset, last insured, income as-of dates, wages vs self-employment, signed authorization to SSA versus other disclosure).
3. Implement and validate missing fields, applicable branches, repeated rows and continuation sheets, with deterministic validation and human verification; never auto-populate signatures or SSA-only fields.
4. Validate PDF output against actual current official source editions, including page/box positions, user-visible warning of omissions, signature rules, and print/fill behavior; unit plus visual QA of completed *fictional* packets.
5. Assemble generated forms, supporting evidence manifest, reviewed medical narratives, authorization documentation, unresolved items, and staff handoff checklist. Support separately authorized export of originals, protected handling and manual SSA/DDS submission through channels SSA accepts. Manual receipt tracking is not independent proof of SSA acceptance.
6. Package is *ready for practitioner filing review* only after all case-specific form questions, documentary obligations, confidentiality controls and authorized human signoff pass. SSA—not SOAR Desk—decides filing acceptance and disability eligibility.

## Work breakdown and next acceptance steps

| Order | Deliverable | Verification |
|---|---|---|
| A | New local document JSON inference and unified interview | CI TS build + Python offline tests; manually demonstrate fictional applicant data reused across forms |
| B | Complete SSA official-form inventory and field/question semantics | Per-form source PDF hashes, every relevant printed question numbered, independently approved crosswalk |
| C | Preserve review decisions and source-linked findings in encrypted case | Backup/restore, case switching and provenance consistency tests |
| D | Whole-document handling at scale | Bounded memory/CPU, chunk progress, cancellation, 100+ pages where performance supports, no truncation |
| E | Complete official PDF packet and source manifest | Independent SSA form edition/visual/signature/relevance QA using synthetic fixtures |
| F | Native Windows operator acceptance | Windows 11 x86 CUDA/ARM GenieX where supported; usability, offline networking inspection, data security assessments |

The changes in this branch are **not a change to the Cloud/SaaS architecture**. They are local-only code intended for desktop acceptance and gradual hardening.

## Acceptance checklist for PR reviewers

1. On a fictitious case, answer person.name once in Unified interview; confirm the answer appears in SSA-16, SSA-3368, SSA-827 and SSA-3373 question views. Verify edits propagate, and a question marked unknown is not guessed.
2. Add one fictional job and provider; confirm shared repeatable row lists remain consistent.
3. In Document evidence, process a 2-page fictional PDF. Confirm Qwen returns page-linked JSON. Check that every quote actually appears in extracted source text, and none is automatically promoted.
4. Test a 25-page fictional PDF: document-level result should show number of processed windows; any failed windows/unreadable pages should force incomplete.
5. Verify one field or quoted narrative against source, select, and send to Interview. It must not replace a filled answer and must carry a source reference and **needs clarification** status.
6. Attach original to encrypted case and reopen; verify registered evidence blob and digest, and inspect the case’s review source.
7. Package screen continues to say **NOT submission-ready** until full edition-verified SSA mapping exists.

**Do not use client PHI or source medical records to test these features in GitHub issues or CI.**
