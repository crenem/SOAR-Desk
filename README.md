# SOAR Desk

**Open-source, local-first tools for disability advocates and nonprofit organizations.**

SOAR Desk is a community project to help practitioners organize adult SSI/SSDI referral screening, evidence gathering, applications, deadlines, and outcomes. The project is inspired by the SOAR (SSI/SSDI Outreach, Access, and Recovery) practice model.

> **Status: Pre-alpha / development only.** Do not enter real client records, protected health information (PHI), Social Security numbers, or credentials. Encryption, access control, validated workflows, and security review are not yet implemented.

## Project goals

- Provide a no-cost desktop application that can operate offline.
- Support transparent referral triage using **functional evidence**, not diagnoses alone.
- Make SSA requirements distinguishable from SOAR recommendations and local agency policy.
- Preserve applicant autonomy: the software never makes SSA eligibility determinations or prevents anyone from applying.
- Make case files portable and avoid vendor lock-in.
- Eventually offer an optional self-hosted, multi-user nonprofit deployment.

## Roadmap

1. **0.1 — Foundations:** domain models, workflow definitions, synthetic-case tests, practitioner documentation.
2. **0.2 — Desktop prototype:** Tauri interface, local case management with security gating.
3. **0.3 — Evidence and tasks:** request tracking, functional assessment, deadline notices.
4. **Later:** document vault, FAST MSR editor, reporting, and optional agency server.

See [project charter](docs/CHARTER.md), [architecture](docs/ARCHITECTURE.md), [workflow reference](docs/SOAR-WORKFLOW.md), and [roadmap](docs/ROADMAP.md).

## Development

Install the current stable Rust toolchain and run:

```bash
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

The repository currently contains the framework-independent Rust domain crate. The Tauri application will be added after the core model and security requirements have been reviewed.

## Privacy

**Never open a GitHub issue or pull request containing real client data.** Test fixtures must be invented or irreversibly synthetic. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## License

The software is licensed under **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. See [LICENSE](LICENSE). Contributed project documentation is also distributed under the same license unless explicitly marked otherwise. Third-party official forms, agency materials, trademarks, and SOAR/PRA content retain their respective rights; the project does not claim ownership of them.

SOAR Desk is an independent community project, not affiliated with or endorsed by SSA, SAMHSA, or Policy Research Associates.
