# SOAR Desk: SSA-16 and SSA-8001-BK Workflow Map (Draft v0.1)

**Scope:** Adult post-screening benefit application preparation, synthetic data only. This is a source-grounded form inventory, not a determination of SSA requirements beyond the two supplied forms. Screening stays a practitioner decision, not an automated eligibility gate.

## Source forms

| Form | Title | Revision | Pages | Interactive PDF widget count | Distinctive character |
|---|---|---|---:|---:|---|
| SSA-16 | Application for Disability Insurance Benefits | 09-2025 | 7 | 148 (89 text + 59 button) | Title II SSDI application, earnings, employment, onset, family history |
| SSA-8001-BK | Application for Supplemental Security Income (SSI), Deferred or Abbreviated | 07-2023 | 12 | 447 (196 text + 251 button) | Title XVI abbreviated/deferred SSI application, living arrangement, resources, income, SNAP/Medicaid |

Both supplied PDFs are **XFA-based, with AcroForm widgets and owner-controlled encryption/permission settings**. They are not flat scans. PDF-reader compatibility and form population must be proven with synthetic outputs; generic AcroForm-only pipelines may not correctly preserve XFA form appearances. Preserve source files unchanged. Do not auto-complete SSA-only areas or claim that printable copies have been officially filed.

The supplied SSA-8001-BK calls itself **Deferred or Abbreviated**: do not claim this alone completes every SSI application requirement. Request any additional forms/procedures before building full-package completion logic.

## Proposed first post-screening workflow

1. **Accept for preparation:** Practitioner has completed screening independently; record date accepted, intended application pathways (SSDI, SSI, or both) and preferred contact method. This is a human decision. Do not auto-exclude.
2. **Create application record:** One profile per fictional applicant, with distinct form instance per benefit type and specific revision. A case may carry both SSA-16 and SSA-8001-BK without merging the two applications.
3. **Conduct common interview once:** Identity, alternate names and SSNs, DOB, birth location, language, citizenship/immigration facts, marital/family, mailing/contact/residence, disability, vision.
4. **Conduct relevant conditional branches:** SSDI history of covered work and employer pay; SSI living arrangements, financial resources, recent transfers, income, program coordination. Preserve question-level provenance.
5. **Review answers and supporting documents:** Each answer is `unknown`, `not_asked`, `provided`, `document_supported`, `reviewed`, or `needs_clarification`. An explicitly reported 'No' is not equivalent to missing. No unsupported field prefill.
6. **Generate form drafts:** Populate only confirmed answers, preserving layout; review printed appearance and page-specific content; mark staff-only areas as excluded.
7. **Human signatures and permissions:** Track applicant ink signatures, conditional spouse signatures, financial record authorizations, and two witnesses if signed by mark (X). No fabricated or automatic signatures.
8. **Submission preparation:** Package documents and a checklist; track actual submission/receipt separately. SSA-specific receipt areas are completed by SSA, not SOAR Desk.

## Shared interview: normalized concept -> original questions

| Canonical concept | SSA-16 | SSA-8001-BK | Rule |
|---|---|---|---|
| Applicant legal name, DOB, SSN | 1, 2, 4(a) | 1(a)-(c) | Reuse applicant-verified facts |
| Preferred written and spoken language | 3 | Header | Keep spoken and written separately; SSA-16 asks item 3 only if English not preferred |
| Birthplace | 4(b) | 7 | Reuse where equivalent |
| Alternate names/SSNs | 6, 7 | 6(a) | Keep historical details separately; SSI also asks about spouse/parents |
| Citizenship/immigration | 5 | 10-15 | Do **not** map into a single boolean; SSI asks more detailed status/residence questions |
| Marriage and spouse | 11 | 2, 4, 5 | SSA-16 prior-marriage/dependent questions vs SSI current marriage/living together/holding-out differ |
| Claimed onset/work limitation | 8, 17 | 9(a)-(b) | Related but not identical question wording; ask for confirmation before reuse |
| Low vision/blindness | 19 | 9(c), 9(f) | Reuse only for same person/date |
| Dependent children and household | 12, 22-24 | 3, 20, 29(a) | Applicability differs; SSI item 20 omitted if transient/homeless/institutional per form instructions |
| Mailing/contact address | Signature page (p5) | 16 | Residence addresses separately from mailing addresses |
| Other public benefits | 20 | 27-28 | Different scope: SSA-16 other disability benefits; SSI SNAP/Medicaid coordination |
| Remarks | p5 | Part 7 (p9) | Store keyed by form and source item |

## SSA-16 page inventory (revision 09-2025)

- **p1, items 1-10:** identity; preferred language; DOB/birthplace; citizenship/lawful presence; prior names/SSNs; disability onset; railroad work; foreign Social Security credits.
- **p2, items 11-12:** current marriage; qualifying former marriages (including special rules involving deceased prior spouses and children); potentially eligible children/dependent grandchildren. Capture as repeatable person/relationship records.
- **p3, items 13-19:** years without Social Security covered wages (1978 through previous year); current and prior-year employers; self-employment details; annual income; continuing work limitations; work-related illness/injury; visual impairment.
- **p4, items 20-24:** other public disability benefits; employer payments after onset or expected later; special child/dependent-parent and early-onset parent/grandparent questions.
- **p5:** remarks, perjury declaration, ink applicant signature/date, daytime phone, banking/direct deposit choices, mailing/county/residence distinction, two witnesses only for signature by mark.
- **p6:** information/privacy notices, not questionnaire inputs.
- **p7:** SSA claim receipt and post-filing change-reporting, not an applicant interview section.

## SSA-8001-BK page inventory (revision 07-2023)

- **p1, header + Part 1 items 1-5:** claim type, language and filing-related fields, applicant/spouse/parents, current marriage and living-apart date, holding-out relationship; form mentions SSA-4178 follow-up. Do not automatically set SSA administrative filing/receipt fields.
- **p2-4, Part 1 items 6-14:** other names/SSNs; birthplaces; adult vs child disability, onset and vision; detailed nationality/immigration status, date of U.S. admission and sponsoring, status transitions, abuse-related immigration petitions, veteran status and residence histories. These require accurate branching, not free-form approximations.
- **p5, Part 1 items 15-17 and Part 2 items 18-20:** recent travel, mailing information, specified fugitive warrant questions; residential address, living arrangement categories including `Transient or homeless`, date arrangement began, and special instructions: when homeless/transient, **do not answer item 20; explain in remarks**.
- **p6, Part 3 items 21-22:** 14 asset/resource categories, ownership and co-ownership, applicant vs spouse/parent values, assets set aside for burial expenses. Snapshot is **first moment of the filing-date month**, with remarks explaining subsequent changes.
- **p7, Part 3 items 23-24:** property transfers within the specified **36-month** lookback and filing-month-to-present period, including co-owned property; financial record permission. Explicit authorization must not be assumed.
- **p8, Part 4 items 25-26:** income received from the start of filing month and expected in the next **three months**, including in-kind payments and spouse/parent child support. Part 5 items 27-28(a): SNAP questions and Medicaid medical-support assignment-of-rights instructions; note state-dependent skip at 28(a).
- **p9, Part 5 items 28(b)-(c) + Parts 6-7:** other health insurance, outstanding medical expenses in the 3 months before filing month, representative payee history, item-numbered remarks (form suggests signed SSA-795 for additional space).
- **p10, Parts 8-9:** financial-record authorization information, truth declaration, ink applicant signature, conditional spouse signature, notice format accommodations, two witnesses if signature by mark.
- **p11:** SSA receipt/acknowledgment, not part of the applicant interview.
- **p12:** privacy and paperwork notices, not part of the applicant interview.

## Important temporal safeguards

Never collapse distinct clocks into one `income`, `assets`, or `onset` value:

- SSA-16 item 14 asks employment during **this year and last year**; item 16 asks earnings last year and earnings so far this year; item 8 asks when conditions first became severe enough to prevent work.
- SSA-8001-BK Part 1 starts at **the first moment of the filing-date month**; Part 3 resource values are at that moment; item 23 has a **36-month lookback**; Part 4 covers income since that moment **and expected in the next three months**; item 9 asks a specific work-limit onset date.
- A later case update must not overwrite an earlier filing-date snapshot. Capture `as_of`, `period_start`, `period_end`, `source`, `entered_by`, `review_status` where relevant.
- For those experiencing homelessness, keep **mailing vs residence vs sleeping location** separate. Never fabricate a street address or change the person's reported situation to fit a field.

## Proposed architecture / module boundaries

- `ApplicantProfile`: identity + contact + names/SSNs; structured repeating relationships.
- `DisabilityHistory`: reported symptoms/function, applicant's onset/ability dates and vision answers; each form's distinct answers retained.
- `EmploymentHistory`: employers, covered wages, dates, pay and self-employment.
- `HouseholdAndLivingArrangement`: SSI address history, homelessness/transient branch, cohabitants, dates.
- `FinancialSnapshot`: dated resources, ownership, transfers, income projections, authorization answers.
- `InterviewAnswer`: form ID+revision+question key, value, answer state, provenance, reviewer and timestamp.
- `FormInstance`: program, versioned template, question applicability, draft status, rendering validations.
- `SignatureTask` and `SubmissionTracking`: separate from applicant facts and from receipt issued by SSA.

For all conditional sections, record `NotApplicable` only after an explicit answer triggers the documented skip. Do not silently convert missing into 'No' or disqualification. For fields SSA directs not to be completed, mark `SSA_ONLY`.

## PDF implementation constraints

Both PDFs use XFA and AcroForm widgets. SSA-16 has 89 text and 59 button widgets; SSA-8001-BK has 196 text and 251 button widgets. Source files have restricted PDF modification permissions. First implement **read-only field discovery, question mapping, synthetic values and visual verification**. Avoid assuming PDF-lib, Poppler, or a Chromium renderer will preserve interactive XFA fields. A print-ready overlay built from a separately rendered blank form is a fallback only after visual review and a compliance/acceptance check; preserve unchanged originals. Test Acrobat and at least one independent PDF renderer.

## Scope boundaries

This inventory intentionally **does not** establish whether these are all forms necessary to submit an SSI/SSDI claim, whether SSI and SSDI should always both be pursued, or whether a particular applicant qualifies. Additional supplied forms and SSA guidance will be added separately. Development data remains synthetic until storage encryption, access controls, audit logs, and compliance controls are implemented.

## Near-term acceptance criteria

- A fictitious applicant's identifying answers populate a shared interview without manual re-entry in both applicable forms.
- All 14 SSA-8001 Part 3 categories can be represented without losing ownership, values, or filing-month snapshot.
- A transient/homeless branch routes SSI item 19 -> item 20 skipped -> remarks, without treating the user as ineligible.
- Human reviewers can leave unknown values unknown and record the source, corrections, and completed-date of every answer.
- Applicant/special witness signatures are never synthesized.
- Printable draft form layouts match the originals in page numbering, question numbering, text and checkbox placement.
- No system action transmits applicant data externally, submits an SSA claim, or claims an SSA receipt unless explicitly authorized and actually verified.
