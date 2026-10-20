# Epic #4 / Story #5 — SSA Blank-Form Source Audit Protocol

**Status: implementation in progress; source PDF field review NOT completed.**  
**Privacy classification:** public SSA blank-form layouts, locally cached. **Never place applicant data, completed forms, or PHI in this folder or generated audits.**  
**Scope:** SSA-16, SSA-8000-BK, conditional SSA-8001-BK, SSA-3368-BK, SSA-827, SSA-3369-BK, SSA-3373-BK. Additional forms will have separate applicability decisions.

## The objective

Establish a defensible inventory of all pages, printed prompts, signature and witness instructions, continuation sections, checkboxes, AcroForm widgets, and XFA/manual fields in the **exact official form editions** used by SOAR Desk.

The inventory is NOT the application crosswalk. It is the source evidence from which verified `printed form item → canonical applicant answer or form-specific answer` mappings can be approved in stories #6–9.

## How to generate the review queue (offline after downloading blank forms)

From the repository root:

```bash
./scripts/fetch-ssa-templates.sh
python3 scripts/audit-ssa-source-forms.py \
  --template-dir .local/ssa-templates \
  --require-download-manifest \
  --output .local/ssa-templates/all-form-field-inventory.json \
  --review-queue .local/ssa-templates/ssa-source-review-queue.csv
```

The fetch script downloads unchanged PDFs from the listed official `https://www.ssa.gov/forms/` URLs and records a `manifest.tsv` containing the source URL, SHA-256 and byte length. It does not authenticate the semantic correctness of forms. The audit refuses files whose digest, byte length or URL do not match this local manifest when present; with `--require-download-manifest`, missing provenance becomes a blocking error.

**If the SSA website refuses a download:** obtain the blank current official PDF using your own browser and only then inventory it. The source will remain `NO_DOWNLOAD_MANIFEST_OFFICIAL_SOURCE_UNCONFIRMED` unless you document and verify its actual origin. Do **not** invent a source SHA or modify the cache provenance by hand to bypass the gate.

Generated outputs are gitignored local artifacts and may contain only public printed form content:

- `all-form-field-inventory.json`: machine-readable pages, SHA-256, source navigation URL, PDF form technology, all extracted printed lines, every interactive widget, checkbox on-states, geometry, page flags and unresolved warnings.
- `ssa-source-review-queue.csv`: one row **per page (including blank/scanned pages)**, per extracted printed line, and per PDF widget. Every row starts **UNREVIEWED**, with no approved canonical key, reviewer or completion assertion.

Exit 0 means all locally cached PDFs were successfully processed; **it never means current editions or form mappings are verified**. Any missing, corrupted or mismatched source results in exit 2.

## Review procedure and evidence

1. **Confirm authoritative source.** Open the original blank source on SSA.gov, verify the form ID, printed edition/date on *all relevant pages*, and record source SHA-256. Do not infer a current edition from the filename. The 2026 SSA-3373 downloaded edition previously contained inconsistent page headers; resolve such discrepancies with SSA rather than guessing.
2. **Visual page-by-page inspection.** Render every page and compare visually against all lines/widgets in the JSON/CSV. Check scanned/image-only material, footnotes, printed blanks without AcroForm widgets, XFA/dynamic form behavior, handwritten signature/witness instructions, checkbox options, continuations, SSA-only areas and instructions outside visible text extraction. Page records ensure missing text cannot be treated as absence of questions.
3. **Disposition every element.** Reviewers must mark each source *page*, printed prompt and widget as one of: `mapped_candidate`, `instruction_only`, `ssa_only`, `not_applicable_to_selected_pathway`, or `clarification_required`. Retain the printed text and approved page/field geometry, correct source edition and identity of reviewer. Unclassified elements block form coverage.
4. **Establish mappings in story #6.** Only after verified page/field coverage should a separately-reviewed typed field contract map each printed item to a canonical answer or form-specific value. Generic proximity suggestions are not approved mappings.
5. **Edition changes trigger re-review.** Run with `--compare-baseline /path/to/previous/all-form-field-inventory.json`. A changed SHA outputs `SOURCE_CHANGED_REAUDIT_REQUIRED`; all formerly approved mappings for that form require revalidation and a new explicit decision. No silent copy-forward of approved review states.
6. **Independent signoff.** A reviewer should confirm original PDFs and detailed correspondence using visual comparisons; a second qualified reviewer should validate the form semantics, branching and relevant SSI/SSDI applicability before fields affect readiness or PDF output.

The CSV is a **review work queue**, not an attested or cryptographically signed approval artifact. Edits to CSV do not automatically authorize PDF form population, and the audit does not import approvals from CSV. Approval-state storage and enforced crosswalk completeness belong to later stories #6 and #9.

## Security and quality rules

- No OCR/LLM-generated text or form field may self-approve.
- No automatic SSA signature, acknowledgment, filing, eligibility decision or PHI transmission.
- PDFs stay in the local gitignored `.local/ssa-templates/` directory, not GitHub.
- Empty text, flattened printed PDF fields, image-only pages, and XFA sections remain flagged for manual inspection.
- An on-page candidate number (e.g. `1.A.`) does **not** establish a unique question ID; repeated subquestions or unrelated item headings require individual reviewer decisions.
- A field's legal meaning depends on timeframe, respondent, subject and conditional applicability. Do not merge two questions merely because their labels sound alike.

## Tests and checkpoints

Unit tests use tiny, fully fictional PDFs built in memory and saved to temporary test directories. They verify:
- Every printed line, widget, and *page* (including blank pages) appears in the review queue.
- Detection of numbered prompts, signature cues and SSA-only labels.
- AcroForm widget handling and explicit lack of a field-population approval.
- Stable page/field IDs for unchanged source hashes and automatic identity changes on amended PDFs.
- Recorded download hash/URL/size integrity; missing/mismatched provenance must block verified-source status.
- Malformed, symlinked or unknown sources fail safely.

Run: `python3 -m unittest discover -s workers -p test_audit_ssa_source_forms.py -v`

**Development dependency:** This branch is based on open draft PR #3 (`feature/local-unified-interview-document-json`). This is a stacked implementation; do not merge source-inventory code into `main` without incorporating and validating the baseline first.

**Completion gap / next step:** The seven actual original SSA PDFs must be downloaded and visually checked by an operator in the local environment, then each field crosswalk approved; that has not yet happened in this branch. This story supplies the repeatable inventory and provenance controls, not a claim of complete SSA forms.
