# SOAR Desk: Synthetic application draft package and evidence register

**Stage:** working development milestone, 2026-10-16. **Not an official, completed or submittable SSA packet.** No real applicant information; local in-memory input only until protected case persistence, authorization and audits are implemented.

## What is implemented

The desktop Application Preparation workspace now contains:

1. **Guided interview:** SSA-16, SSA-8000-BK, SSA-3368-BK, SSA-827, SSA-3369-BK, SSA-3373-BK starter sections; SSA-8001-BK deferred/abbreviated reference only.
2. **Evidence register:** Manually create a unique `SYN-EV-0001`-style reference for a **fictional** provider note, applicant statement, employment source or other evidence. Include source title, page/location, notes, review status and a fictional reviewer code. Human verified requires **source location, note and reviewer**. No document bytes or external LLM output is attached.
3. **Field provenance:** Enter that exact `SYN-EV-...` code in a question's **Answer source and review** field, or a repeatable row's source field. Export associates the field with the corresponding indexed source. Unknown or rejected sources must not be misrepresented as verified; the export warns on unreviewed or unrecognized source identifiers.
4. **Draft package:** A preview of selected program forms, partial edition-labeled crosswalks, mapped question coverage, missing captured values, evidence references, source warnings and staff-authored manual filing/acknowledgment logs.
5. **Explicit export:** After confirming **fictional data only**, use **Save synthetic draft JSON...** to choose a native local filename. The app generates a UTF-8, versioned JSON manifest using a bounded Tauri Rust command. It **never overwrites** an existing file and never automatically saves or uploads case data.

The result is a portable structured case draft, not SSA PDFs, a finalized Medical Summary Report, completed signatures or a bundle of source medical records.

## Try it on Windows ARM64 with WSL2

1. Relaunch SOAR Desk from its existing Windows shortcut, which fast-forwards clean repository revisions.
2. Choose **Load synthetic Jane Doe example**.
3. In **Evidence register**, create a fictional clinical source, e.g. `SYN-EV-0001`. Provide a title, fictional document location (`Page 3, treatment history`), actual-support note, and select **Human verified** with fictional reviewer code.
4. In the SSA-3368 interview, under **About the applicant**, expand **Answer source and review** for a test answer and enter `SYN-EV-0001` as source reference. Do **not** claim clinical evidence supports identity data unless the fictional source actually does; select an appropriate answer.
5. Open **Draft package**. Confirm the source reference resolves and that missing questions are counted separately from explicitly unknown answers.
6. Check **I confirm this workspace contains only fictional training information**.
7. Click **Save synthetic draft JSON...** and pick a new `.json` filename. If the path already exists, the backend deliberately refuses to overwrite it; choose a new name.
8. Open the exported JSON in a text editor. Confirm `file_kind`, `synthetic_only`, `case_reference`, all selected `forms[]` with question identifiers and review states, `evidence_register[]`, `source_reference_warnings[]`, and `submission_log`.
9. Close and relaunch the app to confirm interview state is intentionally NOT restored.

All references, names and dates used for testing must be fictional. The demo and "synthetic confirmed" checkbox are **not** an effective PHI redaction solution.

## JSON compatibility contract (v1)

- `file_kind`: `soar-desk-synthetic-application-draft`
- `schema_version`: `1`
- `synthetic_only`: `true`
- `case_reference`: matches `SYN-...`
- `forms[]`: official form ID, title, observed edition, SSA URL, `mapping: "PARTIAL"`, `completion_claim: "NOT_ASSESSED"`, mapped question and optional collection entries, explicit `not_asked` for missing applicable answers.
- `evidence_register[]`: user-entered source metadata only, including `pending`, `human_verified` or `rejected`.
- `source_reference_warnings[]`: unresolved IDs or references to pending/rejected sources.
- `submission_log`: manual local packet states and events for the case; does not authenticate data with SSA.
- `summary.ready_for_ssa_submission`: permanently `false` in this prototype.

**Do not reinterpret `captured` as field-level completion.** A large compound question may still require additional details even when a response is present, and some original numbered questions have not been mapped at all.

The Rust export command validates critical tags, size (2 MB cap), `synthetic_only`, the `SYN-` case reference and the non-submittable flag. It creates a new local JSON file via `create_new` and does not accept overwriting an existing file. The frontend has only `dialog:allow-save`, not unrestricted filesystem plugin access. These constraints reduce accidents; they **do not** make this preview safe for real PHI/PII.

## Safety and production requirements

- No automatic transfer of evidence from Laya/Qwen into federal application answers. The registration/review step is always manual.
- No SSA API connection, upload, benefit status API, or receipt verification.
- No applicant signature generation or representation attestation.
- Export is **plain-text JSON** and can sync or be backed up by the user-selected folder. Never export real personal/medical records with this development build.
- No encryption, user authentication, role separation, immutable audit or retention. Do not use for real client records.

## Automated verification

Run from `apps/desktop`:

```sh
npm run test:forms
npm run test:submissions
npm run test:package
npm run build
```

Rust:

```sh
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

The desktop GitHub Actions checks run the new package test; Rust CI runs a synthetic draft-validation test that rejects malformed JSON or claims that the export is SSA-submittable.

## Engineering follow-up

1. Complete the source-specific and condition-specific SSA question crosswalks, and verify edition changes.
2. Implement XFA/AcroForm field binding or audited visual overlay to populate **original unaltered SSA templates** from human-reviewed data with test/visual comparison. Never claim a partially mapped interview is a complete form.
3. Add protected encrypted local case persistence, identity/roles, audit events, consent, a usable deletion/retention policy and tests before real data entry.
4. Link real document metadata *after secure storage*; allow an operator to affirm selected, exact source quotations, never silently trust LLM output.
5. Prepare a separate printable review checklist, original PDF form drafts, and submission attachments. Only add authenticated SSA upload if SSA explicitly authorizes the specific integration.
