# SSA Semantic Verification — Batch 1 (Identity, Contact, and Authorization)

**Status:** Provisional source wording review completed October 20, 2026; **independent clinical/legal/form review is still required**. Not SSA-approved, not a complete field inventory and **no production PDF population**.

## Basis and scope

Reviewed the printed wording and page layouts in seven user-provided blank SSA forms, whose 84 pages and 2,745 widgets reconcile to the SHA-256 source inventory. The existing 35 conservative candidate text widgets (formerly mapped to 13 pilot canonical keys) have been assessed for **respondent, legal subject, timing, question applicability, output semantics, and conflicting lookalike fields**.

This batch defines **18 provisional concepts** and **9 corrections to earlier keys**. Each mapping has status `SOURCE_WORDING_REVIEWED_PENDING_INDEPENDENT_QA`, not form-filling approval. The remaining **2,710 PDF widgets** still require semantic classification, and the source review CSV's 7,505 items are not individually signed off.

## Source-specific review observations

| Form | Printed source pages | Semantic treatment |
| --- | --- | --- |
| SSA-16 (09-2025) | p. 1, items 1–4 | Claimant name/SSN/DOB can be shared only after same-person verification. Item 3 asks separate *spoken* and *written* language preferences **only if English is not preferred**; do not equate preference with ability to read/write English. |
| SSA-8000-BK (09-2024) | p. 1, items 1–3 | Item 1 claimant identity; item 2 is expressly **Applicant's Mailing Address** while item 3 separately asks **Claimant's Residence Address**. These are not interchangeable. Part 1 uses the first moment of the filing-date month; later resource questions use specific filing-month windows. |
| SSA-8001-BK (07-2023) | p. 1, items 1–5 | Identity and language fields are similar to SSA-8000, but the form is clearly **Deferred or Abbreviated**; never treat it as a universal full SSI application. |
| SSA-3368-BK (06-2024) | p. 3, items 1.A–1.F | Instructions define “you” as the disability applicant, *even when another person completes the report*. Claimant contact fields include a daytime **primary number where a message can be left**, not necessarily personally owned. |
| SSA-3369-BK (07-2026) | p. 3, Section 1, A–C | Identity belongs to disability claimant even if another person completes it. Daytime primary telephone is a **reachable contact channel**. Section 2 covers jobs in the five years before unable to work, excludes jobs of fewer than 30 calendar days and includes self-employment and foreign work; do not conflate with SSI earnings or job status as of filing month. |
| SSA-3373-BK (08/10-2026 mixed headers) | pp. 3, 10 | **Page 3 Name_FLD** means disabled person; **page 10 Name_FLD** means the person completing the form. They are distinct. Page 3 phone input consists of area code, number and a required **Your Number / Message Number / None** choice. All 10 pages need edition reconciliation before approved form filling. |
| SSA-827 (06-2024) | p. 1 | “Whose Records to be Disclosed” denotes the **records subject** (name, SSN, DOB). Phone below execution block belongs to **signer**. A parent, guardian or representative can sign under applicable authority. The release expressly runs to SSA/DDS; it does not automatically authorize SOAR Desk or a disability attorney to request records. |

## Corrected pilot data concepts

Nine original canonical candidates required safer roles:

- SSA-827 three **records subject** identifiers: `authorization.ssa827.records_subject.name`, `.ssn`, `.dob` rather than unconditional `person.*` copying.
- SSA-8000 item 2 mailing: `ssi.application.mailing.street` and `.postal_code` rather than automatic `person.mailing.*`.
- SSA-3368 1.F and SSA-3369 1.C: `case.daytime_contact.primary_phone` rather than an assumed personally owned phone.
- SSA-3373 item 3: `report.ssa3373.daytime_phone.area_code` and `.local_number`, held until the form's contact-type choice is known.

The other 26 remain subject to applicant identity/timeframe validation. The existing `person.name` and `person.ssn` keys are **not** legal proof of subject identity; they can be reused only when the correct claimant/benefits subject has been verified.

## Automated protections in this stack

`config/ssa-semantic-review-batch1.json` records 35 page-anchored semantic decisions and 18 concepts. `scripts/verify-ssa-semantic-review.py` cross-checks the stored source inventory, candidate seeds and **original local PDF SHA-256**, and blocks:

1. Missing or ambiguous source widgets, duplicated/removed review dispositions and changed printed source cues.
2. Claimant/records subject, applicant/preparer, and SSI mailing/residential misassignments.
3. Attempts to drop SSA-16 conditional language prompts or SSA-3373 phone channel routing rules.
4. Incompatible canonical subject/time basis/reuse policies across source forms.
5. Any attempt to set PDF readiness, independently approved field status or automatic form-filling permission.

All tests use fictional, generated fixtures; **real claimant medical data must not be placed in GitHub or test artifacts**.

### Generate a local human-review artifact

In WSL, from the branch `feature/epic4-semantic-review-batch1` (which is stacked on PRs #3, #10, #11):

```bash
python3 scripts/verify-ssa-semantic-review.py \
  --inventory .local/ssa-templates/all-form-field-inventory.json \
  --template-dir .local/ssa-templates \
  --out-dir .local/ssa-templates/crosswalk-review
```

Outputs `ssa-semantic-review-batch1.json` and `ssa-semantic-review-batch1.csv`, each explicitly review-only, retaining the exact source form, page and widget reference.

Generate an additional source-linked **300 numbered-line question review queue** (these may include headings or partial questions and are never self-approved):

```bash
python3 scripts/build-ssa-question-review-ledger.py \
  --inventory .local/ssa-templates/all-form-field-inventory.json \
  --out .local/ssa-templates/ssa-numbered-question-review.csv
```

Each row retains the printed cue, page, source line ID, and *unverified* candidate branch/timeframe words, with empty respondent, timeframe, applicability and canonical approval columns for qualified review.

## Follow-on batch

The next semantic pass should prioritize **employment and functional evidence** across SSA-3368, SSA-3369 and SSA-3373, then **SSI household, income and resources** in SSA-8000/8001. One job entry can inform multiple questions but **job type, physical demands, reporting period, applicant statement and source-verifiable facts are separate dimensions**. Narrative evidence from the local Qwen JSON worker must remain separate from the applicant's interview testimony until source-grounded practitioner review.

**Acceptance gate remains open:** independent reviewer/source-edition signoff, full field/branch coverage, XFA visual filled-form QA and authorized signatures are still required before a submission-ready packet can exist.
