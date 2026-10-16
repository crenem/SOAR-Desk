# SSA adult SOAR application forms: official source catalog

Research date: 2026-10-16. Scope: **adult initial SSI and/or SSDI applications** in a SOAR-style support workflow. Sources are SSA's public forms directory and published Program Operations Manual System (POMS); this is **not** an exhaustive list of every form SSA might request in every individual case. **All forms are free at SSA.gov.**

**Do not treat the set below as one mandatory paper packet.** SSA allows online initial applications, has separate SSI filing pathways, and requests different supplementary forms depending on the individual's circumstances and its development requirements. No screening or nonmedical technical denial decision is automated in SOAR Desk.

## A. Initial claim application: program- and procedure-specific

| Form | Name and original SSA download | When to enable in SOAR Desk |
|---|---|---|
| **SSA-16** | [Application for Disability Insurance Benefits (09-2025)](https://www.ssa.gov/forms/ssa-16-bk.pdf) | SSDI (Title II) *paper* filing, where applicable. Existing user-provided sample already mapped. Online and assisted filing also available. |
| **SSA-8000-BK** | [Application for Supplemental Security Income (09-2024)](https://www.ssa.gov/forms/ssa-8000-bk.pdf) | **Primary full paper SSI application**, per [POMS SI 00604.001](https://secure.ssa.gov/poms.nsf/lnx/0500604001). New template required in SOAR Desk. |
| **SSA-8001-BK** | [SSI Application (Deferred or Abbreviated) (07-2023)](https://www.ssa.gov/forms/ssa-8001-bk.pdf) | **Alternative**, when SSA uses deferred development or an abbreviated application for clear nonmedical technical denial; **do not make this the routine SSI default**. See [POMS SI 00605.001](https://secure.ssa.gov/poms.nsf/lnx/0500605001) and [SI 00602.001](https://secure.ssa.gov/poms.nsf/links/0500602001). Existing user-supplied sample already mapped. |

## B. Disability development: highest priority

| Form | Name / current SSA PDF | Practical trigger |
|---|---|---|
| **SSA-3368-BK** | [Disability Report – Adult (06-2024)](https://www.ssa.gov/forms/ssa-3368-bk.pdf) | Basic disability report or electronic equivalent when disability is developed. Collect impairments, providers, treatment, medications, education, and job history. [POMS DI 10105.085](https://secure.ssa.gov/apps10/poms.nsf/lnx/0410105085). |
| **SSA-827** | [Authorization to Disclose Information to SSA (06-2024)](https://www.ssa.gov/forms/ssa-827.pdf) | Signed medical/education records release, generally for initial claims transferred to DDS. **Not** interchangeable with the SSA-3288 consent to release *SSA-held* records. [POMS DI 11005.022](https://secure.ssa.gov/POMS.NSF/lnx/0411005022). Track signer/date/witness/expiration; no AI signatures. |
| **SSA-3369-BK** | [Work History Report (07-2026)](https://www.ssa.gov/forms/ssa-3369.pdf) | **Especially important for individuals experiencing homelessness or difficult to contact**; SSA POMS describes circumstances for FO completion and exceptions (including only one relevant job and curtailment). [DI 11005.025](https://secure.ssa.gov/poms.nsf/lnx/0411005025). |
| **SSA-3373-BK** | [Function Report – Adult (10-2026 edition shown on form)](https://www.ssa.gov/forms/ssa-3373-bk.pdf) | **Especially important for homeless/difficult-to-contact claimants before DDS transfer**. Include person-reported functional details, activities of daily living, living arrangements, and work limitations. [DI 11005.026](https://secure.ssa.gov/poms.nsf/lnx/0411005026) and [DI 11005.022](https://secure.ssa.gov/POMS.NSF/lnx/0411005022). |
| **SSA-3380-BK** | [Function Report – Adult, Third Party (12-2023)](https://www.ssa.gov/forms/ssa-3380.pdf) | Collect from a knowledgeable third party **when appropriate/requested**; not an unconditional prerequisite to filing every claim. Respondent must describe *firsthand knowledge*, not copy claimant's responses. Older [SSA third-party training](https://www.ssa.gov/thirdparty/assets/materials/training/how-to-apply-for-ssi-ssa-8001.pdf) lists it in a prepared paper disability package; general POMS requirements are more nuanced. |

**Special SSA homelessness instruction:** When EDCS flags a case `Homeless`, it prompts the SSA interviewer to complete SSA-3373 and SSA-3369 before transfer (subject to their individual exceptions). This is not authority for SOAR Desk to classify disability or automatically deny anyone. See [DI 11005.022](https://secure.ssa.gov/POMS.NSF/lnx/0411005022).

## C. Representation / supporting clarification: conditional

| Form | Original SSA PDF or official page | Condition |
|---|---|---|
| **SSA-1696** | [Claimant's Appointment of Representative (12-2024)](https://www.ssa.gov/forms/ssa-1696.pdf) | When a claimant **formally appoints** a qualified attorney/non-attorney representative. Ordinary help completing a form is not, by itself, an appointment. SSA requires claimant and representative signatures and a current edition. [POMS GN 03910.040](https://secure.ssa.gov/poms.nsf/lnx/0203910040). |
| **SSA-795** | [Statement of Claimant or Other Person](https://www.ssa.gov/forms/ssa-795.pdf) | Itemized signed explanation where additional claimant statements are requested (including expansion from the SSA-8001's remarks page). |
| **SSA-820-BK** | [Work Activity Report — Self-Employed](https://www.ssa.gov/forms/ssa-820.pdf) | When SSA develops relevant self-employment work activity. |
| **SSA-821-BK** | [Work Activity Report — Employee](https://www.ssa.gov/forms/ssa-821.pdf) | When SSA develops relevant wage-earning employment after or around alleged onset. |
| **SSA-546** | [Workers' Compensation/Public Disability Questionnaire](https://www.ssa.gov/forms/ssa-546.pdf) | When another compensation/disability benefit triggers development; referenced on SSA-16 question 20. |
| **SSA-4178** | [Marital Relationship Questionnaire](https://www.ssa.gov/forms/) | When household or relationship information requires evaluation as a holding-out couple, as referenced in SSA-8001 item 5. |
| **SSA-8010-BK** | [Statement of Income and Resources](https://www.ssa.gov/forms/) | SSI resource/income clarification when requested. |
| **SSA-8011-F3**, **SSA-8012** | [Statement(s) of Household Expenses and Contributions](https://www.ssa.gov/forms/) | SSI living-arrangement and household contribution verification when requested; particularly relevant if no stable residence. |
| **SSA-8510** | [Authorization for SSA to Obtain Personal Information](https://www.ssa.gov/forms/) | Additional SSA nonmedical-information collection authorization only when required/requested. |
| **SSA-3288** | [Consent for Release of Information](https://www.ssa.gov/forms/) | When claimant wishes SSA to release protected *SSA-held* information to a specified person/entity. Not the SSA-827 medical source authorization. |
| **SSA-11** | [Request to Be Selected as Payee](https://www.ssa.gov/forms/) | Representative-payee selection when needed; typically a later stage, not a universal initial application form. |

## D. Appeals: later-stage forms (not initial filing packet)

| Form | Original SSA link | When |
|---|---|---|
| **SSA-561** | [Request for Reconsideration](https://www.ssa.gov/forms/ssa-561-u2.pdf) | Following an appealable adverse initial determination; medical reconsideration paper filing also requires an SSA-827 according to [SSA instructions](https://www.ssa.gov/forms/ssa-561.html). |
| **SSA-3441-BK** | [Disability Report – Appeal](https://www.ssa.gov/forms/) | New/updated disability information supporting appeal; not used for every initial application. |
| **HA-501-U5** | [Request for Hearing by Administrative Law Judge](https://www.ssa.gov/forms/) | Appeals following reconsideration where appropriate. |
| **HA-520** | [Request for Review of Hearing Decision/Order](https://www.ssa.gov/forms/) | Appeals Council review when appropriate. |

## E. Non-form documents and process artifacts

- **Medical records and medical source information** (providers, diagnoses, procedures, medications, testing, mental/physical functioning). SSA can request records with SSA-827; applicants do not have to independently collect everything before filing. [SSA-3368 instructions](https://www.ssa.gov/forms/ssa-3368-bk.pdf) and [SSA-16 preparation](https://www.ssa.gov/forms/ssa-16.html).
- **Proofs** conditional on facts: proof of identity/age, citizenship/immigration status, earnings and wage records, employer income, workers' compensation benefits, SSI financial resources/living expenses, and possibly relevant proofs of family relationships. See [SSA SSI documents](https://www.ssa.gov/ssi/text-documents-ussi.htm) and [SSA-16 preparation](https://www.ssa.gov/forms/ssa-16.html). Do **not** hold up a protective filing while awaiting the full evidence packet.
- **Adult Disability Starter Kit**: [SSA starter kit](https://www.ssa.gov/disability/disability_starter_kits.htm), optional [medical/job worksheet](https://www.ssa.gov/disability/Documents/Adult%20Disability%20Starter%20Kit%20Optional%20Worksheet.pdf). Worksheet is *not* an application and should not be mailed as one.
- **SOAR Medical Summary Report (MSR)** is a SOAR approach to organizing functional/medical evidence, **not an SSA-numbered official form**. Track as a separate report and associate every factual assertion with human-reviewed source evidence.
- **Submission/receipt log:** file date, filing channel, pending signature tasks, SSA/field office submission confirmation, DDS contacts, follow-up requests and appeals deadlines. A generated PDF is not proof SSA accepted a claim.

## Developer implementation sequence

1. Add **SSA-8000-BK** template and SSI full-vs-deferred pathway logic (do not delete existing SSA-8001 work).
2. Add **SSA-3368-BK** and **SSA-827** as the core adult disability-information and authorization forms.
3. Add **SSA-3369-BK** and **SSA-3373-BK** for the homelessness-prioritized interview, with documented exceptions and direct reference to employer/date and functional statements.
4. Add **SSA-3380-BK** as an optional independently authored third-party interview.
5. Build conditional form templates (1696, 795, 820/821, 546, financial/living-arrangement) on *request-triggered* rather than universal requirements.
6. Track **form edition date, current PDF URL, question mapping version, required applicability, evidence provenance, signature needs, SSA receipt/status**, and human review. When editions change, do not silently migrate completed historical forms.

## Software reproduction / submissions caution

SSA says that a **third party that charges a fee to reproduce or distribute SSA forms** needs SSA approval, and reproduced altered formats may be rejected. The precise consequence for free noncommercial workflows vs future paid distribution should be assessed before commercial release. Source: [SSA third-party form reproduction rules](https://www.ssa.gov/forms/thirdpartyforms.html). Prefer original SSA templates and exact visual verification rather than redrawing a purported "official" application.

This is a research catalog, **not a completed workflow, downloaded PDF bundle, permission to submit on behalf of a claimant, or SSA-approved software**. Only synthetic development data until security controls are available.
