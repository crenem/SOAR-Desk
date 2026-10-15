# Adult SSI/SSDI SOAR workflow — research outline

> **Draft for verification, not a substitute for current SSA instructions or local policy.** Review each external link and applicable form revision before implementation.

| Phase | Work product | Review conditions |
| --- | --- | --- |
| Referral and screening | Recorded facts, sources, triage recommendation | Duration, severe functional limitations, combined conditions, work history; human approval |
| Engagement and intake | Applicant consent, representation, contact plan | Correct current SSA-1696 and releases, organizational authorization |
| Evidence development | Treatment-source inventory, request log, functional narratives | Ensure provenance, follow-ups and completeness |
| Application | SSI/SSDI application packet, filing confirmations | Capture actual protective filing and official closeout deadlines |
| DDS determination | Contact and evidence request log, exam coordination | Separate SSA field office and DDS destinations |
| Decision or appeal | Notice and appeal calendar, disposition/outcomes | Verify individual notice and current filing timeframe |

## Screening safeguards
A diagnosis alone does not establish disability. Equally, absence of treatment records is not proof of unimpaired functioning. Consider cumulative limitations, episodic conditions, poverty-related access barriers, and functional/vocational evidence. `ReviewServiceFit` is an internal service category, **not** an SSA denial or automated exclusion. Applicant may apply independently or through another representative.

## Sources to monitor
- SSA adult disability framework: https://www.ssa.gov/benefits/disability/qualify.html
- SSA forms: https://www.ssa.gov/forms/
- SSA representation: https://www.ssa.gov/representation/
- SSA electronic records: https://www.ssa.gov/ere/
- PRA SOAR resources: https://www.prainc.com/

## Open questions
- Louisiana-specific SOAR relationships and DDS processes.
- Program-specific eligibility and prioritization rules.
- Approved transmission, records retention, release validity, and forms.
- When pediatric SSI or distinct appeals paths become in scope.
