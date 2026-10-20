# Epic #4 · First SSA canonical crosswalk proposal

**Scope:** Adult SSI/SSDI local-only development. **Source:** Seven uploaded blank SSA PDFs and the complete field inventory JSON/CSV. All mappings remain **human-review-only**.

## Reconciled source inventory (2026-10-20)

| Form | Pages | AcroForm/XFA widgets | Numbered-line cues | Source edition cue |
| --- | ---: | ---: | ---: | --- |
| SSA-16 | 7 | 148 | 26 | 09-2025 |
| SSA-8000-BK | 24 | 1,089 | 75 | 09-2024 |
| SSA-8001-BK | 12 | 447 | 26 | 07-2023 |
| SSA-3368-BK | 15 | 444 | 89 | 06-2024 |
| SSA-827 | 2 | 26 | 4 | 06-2024 |
| SSA-3369-BK | 14 | 392 | 57 | 07-2026 |
| SSA-3373-BK | 10 | 199 | 23 | **08-2026 and 10-2026 conflicting labels** |
| **Total** | **84** | **2,745** | **300** | |

All seven uploaded blank PDFs matched their inventory's SHA-256 values exactly. The original review CSV contained **7,505** rows: 84 source-page review tasks, 4,676 extracted printed-line review tasks and 2,745 PDF widget tasks. Every original row remains **UNREVIEWED**.

*These figures describe extracted artifacts—not the number of distinct required questions.* The seven SSA PDFs contain XFA forms; verify rendering, legal form semantics, and checkbox groups separately. The source PDFs were manually downloaded, so the initial SHA manifest identifies the file bytes but does not independently prove SSA's current official editions.

## Initial candidate data dictionary

The committed source seed file `config/ssa-canonical-seed-candidates.json` proposes 35 text-widget bindings for 13 canonical keys. Eight keys have cross-form reuse potential. **No mappings are approved.** This conservative seed is intentionally incomplete; 2,710 widget records have no canonical suggestion yet.

- `person.name` and `person.ssn`: subject identity across 7 forms
- `person.dob`: subject birthdate where explicitly requested
- `person.preferred_language.spoken`, `person.preferred_language.written`
- `person.mailing.street`, `person.mailing.postal_code`
- `person.email`, `person.phone.primary`
- `person.phone.area_code`, `person.phone.national_number`: SSA-3373's **partial** phone widgets; do not treat components as a complete phone field
- `report.ssa3373.completer.name`: page 10 respondent, never automatically the disabled person
- `authorization.ssa827.signer.phone`: signer's number, never automatically subject's number

**Manual verification required:** Even identical answer concepts may require different applicable respondents and effective dates. SSA-827 subject name is for whose records may be disclosed; legal authority of the actual signer is a separate field. SSA-8000 generally asks financial questions relative to filing-date month; current resources/income may differ. SSA-8001 is an alternate/deferred SSI workflow, not an automatic substitute for SSA-8000.

## Reproduce candidate work queue using the local cache

Run from the WSL developer worktree after pulling this feature branch:

```bash
python3 scripts/propose-ssa-crosswalk.py \
  --inventory .local/ssa-templates/all-form-field-inventory.json \
  --queue .local/ssa-templates/ssa-source-review-queue.csv \
  --seeds config/ssa-canonical-seed-candidates.json \
  --template-dir .local/ssa-templates \
  --require-pdf-match \
  --out-dir .local/ssa-templates/crosswalk-review
```

The script writes three gitignored review-only artifacts:

1. `ssa-canonical-crosswalk-candidates.json`: source-hashed widget references and proposed dictionary keys, never approved.
2. `ssa-review-queue-with-proposals.csv`: **all** source review rows preserved, with proposals attached only to the 35 exact widget/page matches. Every PDF widget additionally receives nearby printed-text and preceding numbered-question **proximity hints**, explicitly unverified and never used for automatic mappings.
3. `ssa-cross-form-overlap.csv`: canonical key overlap across forms and respondent distinctions.

The program refuses hash mismatches, wrong page/question cues, missing or ambiguous widget names, duplicate source assignments, any pre-approved source queue, missing source rows, and non-text candidate bindings. It never alters official blank PDFs or claimant data and does not produce a submission package.

## Quality gates still open

- Resolve inconsistent printed edition labels in SSA-3373-BK with authoritative SSA evidence.
- Complete human visual page and field audit; classify all original 7,505 queue entries (many printed lines are instructions, not applicant responses).
- Specify semantic meaning, applicant versus respondent, effective date, answer type, branch conditions, enumerated checkbox groups and repeating structures for each approved mapping.
- Complete canonical registry across SSA-16, SSA-8000-BK, conditional SSA-8001-BK, SSA-3368-BK, SSA-827, SSA-3369-BK and SSA-3373-BK. These are form coverage goals, not guaranteed universally required forms.
- Test XFA/AcroForm rendering and field value appearance against the actual PDFs and visually inspect synthetic-filled copies.
- Never mark a form or package ready until all applicable questions, legal signatures, SSA output fields and review requirements are explicitly met.

**Related:** [Epic #4](https://github.com/crenem/SOAR-Desk/issues/4), [Story #5](https://github.com/crenem/SOAR-Desk/issues/5), [Story #6](https://github.com/crenem/SOAR-Desk/issues/6), stacked on draft PR #10.
