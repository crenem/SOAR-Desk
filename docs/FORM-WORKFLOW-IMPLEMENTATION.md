# Post-screening SSA application workflow — implemented pilot

Status: **interactive, in-memory, synthetic-only starter**. Created 2026-10-16. Not approved by SSA and **not** capable of completing, signing, filing or transmitting federal forms. Read together with `docs/SSA-ADULT-SOAR-FORMS-CATALOG.md` and `docs/SSA-16-8001-WORKFLOW-MAP.md`.

## Implemented in the desktop

- New **Application preparation** workspace is the default. Screening remains optional because the practitioner can screen applicants independently. Document evidence/Laya/Qwen is accessible from the sidebar.
- Per-case practitioner choice: prepare SSI, SSDI, or both. This is a manual plan, **not** a determination about federal program eligibility or mandatory filing path.
- Form inventory linked directly to unchanged SSA.gov templates, with version information and coverage notes.
- In-memory question-by-question, source-numbered starter interview for **SSA-16**, **SSA-3368-BK**, **SSA-827**, **SSA-3369-BK**, **SSA-3373-BK**, and **SSA-8000-BK**.
- The previously uploaded **SSA-16** now also has a guided initial interview covering numbered questions 1–24 and its applicant signature page. **SSA-8001-BK** remains inventoried as **reference only** until its nonstandard deferred/abbreviated workflow is designed. Abbreviated SSA-8001 is not selected as the default full SSI filing form.
- Shared canonical keys (e.g., `person.name`, `person.ssn`, `work.onset`) allow one interview answer to populate corresponding *question views*. Form-specific questions remain independent.
- Repeatable, editable synthetic rows for work history, medical conditions, treatment providers, medications, contacts, SSI resources and income; no records are fetched, inferred or silently completed.
- Conditional question branches: e.g., SSI `transient or homeless` selection exposes a dedicated explanation while avoiding ordinary household questions; employment and signature details are similarly conditional.
- Per-answer states: applicant reported, human verified, explicitly unknown, and needs clarification; optional source references. Blank does **not** equal `No`. Hidden dependent answers are excluded from progress views but retained in session in case an earlier answer is revised.
- Review gaps display captured/verified numbers for the *starter interview*, with prominent **not ready for SSA submission** messaging.
- A wholly synthetic Jane Doe scenario tests the branches and shared-field behavior. Switching between application and document tabs retains current interview answers while SOAR Desk is open.

## Verified official source forms

| Form | Official URL | Edition observed / notes |
|---|---|---|
| SSA-3368-BK | https://www.ssa.gov/forms/ssa-3368-bk.pdf | 06-2024; 15 pages |
| SSA-827 | https://www.ssa.gov/forms/ssa-827.pdf | 06-2024; 2 pages; 12-month signed authorization |
| SSA-3369-BK | https://www.ssa.gov/forms/ssa-3369.pdf | 07-2026; 14 pages |
| SSA-3373-BK | https://www.ssa.gov/forms/ssa-3373-bk.pdf | 10 pages; **inconsistent page header edition strings** in SSA's served PDF (10-2026 and 08-2026). Confirm which edition SSA wants before PDF field mapping/production output. |
| SSA-8000-BK | https://www.ssa.gov/forms/ssa-8000-bk.pdf | 09-2024; 24 pages |
| SSA-16 | https://www.ssa.gov/forms/ssa-16-bk.pdf | 09-2025; guided starter with questions 1–24, not yet full structured continuations |
| SSA-8001-BK | https://www.ssa.gov/forms/ssa-8001-bk.pdf | 07-2023; deferred/abbreviated alternate, not default |

The internal `scripts/fetch-ssa-templates.sh` can optionally download unmodified official templates to a **gitignored local cache** and generate SHA-256 inventory. No SSA PDFs or filled application packages are committed. It is for development/reference only, not claimant submissions.

## Manual acceptance test (no production data)

1. Start SOAR Desk from the existing Windows shortcut, with or without GenieX running.
2. Open **Application preparation**. Leave both SSI and SSDI checked initially.
3. Click **Load synthetic Jane Doe example**. Verify reported (not verified) values appear in SSA-3368 Sections 1, 3, 4, 7 and 8; review progress.
4. Switch to **SSA-3369**: the same fictional job appears because the work collection is shared.
5. Switch to **SSA-8000** → Living arrangements. `transient or homeless` branch shows a homeless-specific narrative, not household questions.
6. In SSA-827 mark ink signature `awaiting_ink_signature`, then `signed_on_paper`: only the latter makes the *date* question visible; the software still cannot sign.
7. Switch to **Document evidence** and back. Check that the synthetic interview remains in memory.
8. In **Review gaps**, confirm that unknown/unanswered items are distinct, and nothing is marked ready for federal submission.
9. Run local static tests: `cd apps/desktop && npm run test:forms && npm run build`; GitHub Actions desktop workflow runs both.

## Deliberately not yet implemented

- Complete numbered and subpart-level crosswalks. **Only first-pass question coverage exists** for the five new forms and SSA-16. In particular, detailed SSI full application financial and household sub-branches, SSA-3369 each-job physical activity table, SSA-3368 all contacts/tests, SSA-3373 all individual activity checkboxes, and release witness legal scenarios still require full transcription/mapping.
- Official PDF field names, XFA/AcroForm appearance population, complete synthetic render comparison, paper-form printing, electronically accepted signatures, and SSA-approved submission.
- State persistence, access permissions, audit/change logs, encryption, legal consent capture, or retention policies. Never input real client information.
- Claim filing, protective filing dates and confirmation: should only reflect an independently verified SSA acknowledgment. No automatic service denial/benefits eligibility.
- Integration of the document evidence proposal into reviewed application answers: model suggestions must never silently overwrite an applicant statement.

## Next engineering tasks

1. Parse and map every numbered/subpart question from each current SSA source (including complete SSA-16 marriage and dependent appendices). Preserve edition and routing logic.
2. Build per-form synthetic PDF field / visual template contracts; test XFA forms in official-reader paths before claiming populated forms work.
3. Implement secure local data model and reviewer-provenance audit before allowing real PHI/PII.
4. Integrate human-verified evidence and provider sources from document analysis; separate evidence claims from claimant testimony.
5. Complete practitioner-reviewed sign/print/export/submission-tracking UX with evidence attachments and SSA receipt logging.

**Policy:** No path may treat missing information or lack of healthcare as proof of ineligibility. Staff confirm eligibility questions and signoff outside this prototype.
