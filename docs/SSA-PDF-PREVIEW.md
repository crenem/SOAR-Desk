# Original SSA PDF population: controlled synthetic preview

Milestone: **SSA-16, edition 09-2025, tested with fictional data** (2026-10-16).

## Current implementation

The **Draft package** screen includes **Save synthetic SSA-16 PDF…** when the practitioner has manually chosen SSDI. After fictional-data acknowledgment and an explicit native save location, the Tauri Rust backend invokes `workers/ssa_pdf_worker.py` with the in-memory versioned draft package and a locally cached **unchanged** public SSA-16 source PDF.

- The original seven-page **SSA-16 (09-2025)** is preserved and never overwritten.
- Field mappings are allowlisted by **source-verified exact AcroForm/XFA widget suffixes**, including basic identifiers, several dates and selected yes/no questions (see worker `TEXT`, `BOOLEAN`, `CHOICES`). No guesswork from question numbers.
- Only answers whose review state is `reported` or `verified` and whose values pass type checks are mapped. Missing, `unknown`, `clarify` and unmapped inputs are left blank.
- **Never** populate applicant signatures, witnessing, direct-deposit numbers, SSA-only receipt fields or unverified compound tables.
- Each output page is stamped `SYNTHETIC TRAINING DRAFT` and `NOT FOR SSA SUBMISSION`.
- The output is re-opened and verified for preserved form values and page count before it is published to a user-selected local PDF path with an atomic no-overwrite operation.
- No network call is made by the form worker or Tauri export operation; official public form/template provisioning is a distinct setup step.
- A PDF is **not** an SSA filing, does not establish a protective filing date, and must not be represented as a signed or complete application. The current output remains XFA based and is **not flattened**.

## Setup on Windows ARM64 through Ubuntu WSL2

The normal `scripts/launch-wsl.sh` startup now performs optional one-time tasks:

1. Ensure `pymupdf>=1.24,<1.27` in the local `.venv-laya` Python environment.
2. Download only the unchanged official `https://www.ssa.gov/forms/ssa-16-bk.pdf` into ignored `.local/ssa-templates/ssa-16-bk.pdf`, after verifying an expected PDF header and the `SSA-16 (09-2025)` revision. Store SHA-256.
3. Continue app launch if optional provisioning cannot complete. An attempted PDF export will then explain the missing prerequisite.

Manual first-time setup:

```bash
cd ~/Projects/SOAR-Desk
.venv-laya/bin/python -m pip install 'pymupdf>=1.24,<1.27'
bash scripts/prepare-ssa16-template.sh
```

Never add official form templates, filled PDFs, applicant material, or draft JSON to Git.

## Test with fictional Jane Doe

1. Relaunch the desktop shortcut; the repo automatically updates.
2. Open **Application preparation**, choose SSDI, select **Load synthetic Jane Doe example**.
3. In the SSA-16 interview, enter fictional name, DOB, onset date and selected yes/no values. The demo does not manufacture an SSN.
4. Review gaps and input. Open **Draft package**.
5. Check the fictional-training acknowledgment. Choose **Save synthetic SSA-16 PDF…** and a **new**, local `.pdf` path.
6. Open the resulting PDF in Acrobat Reader and at least one other renderer. Check all populated text and checkbox marks on all seven pages. In particular, confirm the human signature, witness lines and official SSA receipt page remain empty.
7. If any field is clipped, overlaps preprinted content, disappears in Acrobat or has changed meaning, do not use it. Report the form revision and a fictional screenshot for correction.

## Visual and technical verification performed during development

An independently saved synthetic original SSA-16 (September 2025) was rendered through **Poppler** and **PyMuPDF**. Verified visible example fields: applicant name, DOB, disability onset, yes/no checkbox and free-text remarks, with the original seven pages unchanged. SSA-only fields and signature area were empty. The rendered sample PDF was not submitted or uploaded to SSA.

Remaining parity work: test in Acrobat on Windows ARM64 and visually compare **all mapped input fields**, especially long fields and cross-page dynamic XFA behavior, before a genuine filing workflow is considered.

## SSA-3368: research staged, not yet bound

Source: https://www.ssa.gov/forms/ssa-3368-bk.pdf, edition 06-2024, 15 pages.

The original **SSA-3368** PDF was not available as a byte-level source in the development environment used to validate SSA-16; **it would be unsafe to invent its widget identifiers**. To build the correct independent crosswalk on your machine, use:

```bash
cd ~/Projects/SOAR-Desk
bash scripts/prepare-ssa3368-template.sh
```

That downloads the unmodified SSA PDF from SSA, validates the observed edition, and writes a hash and widget inventory to:

```text
.local/ssa-templates/ssa-3368-widgets.json
```

The SSA-3368 export button is intentionally **disabled** until the original field names, positions, checkbox on-states and skip logic are inspected, mapped and visually verified. It is not equivalent to the already functioning SSA-16 preview.

## Controls and limitations

- Field mapping can only read `forms[].sections[].questions[]` from the synthetic package. It does not fill from model-generated source passages or arbitrary text.
- The `SYN-` case prefix and export checkbox are **not PHI/PII detection or encryption**. Do not enter any real identity, medical, work or financial information.
- A successful desktop build or test does **not** prove current SSA acceptability, official endorsement, electronic signature validity, or all-viewer XFA compatibility.
- Any official source PDF edition or widget-layout change is treated as an error rather than silently using approximate fields.
- The next development phase is full question-by-question map for SSA-3368 and SSA-16, signature and consent workflow, Acrobat/Poppler parity tests, and a protected encrypted case store before processing real people.
