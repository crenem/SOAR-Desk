# Contributing

SOAR Desk welcomes contributions from developers, nonprofit practitioners, clinicians, accessibility experts, and people with lived experience.

1. Open an issue describing the change before significant architecture or clinical workflow work.
2. Cite the primary authority and its effective date for any SSA rules or form changes.
3. Include synthetic-data tests. **Never commit any actual client information.**
4. Keep triage suggestions reviewable; avoid eligibility prediction or automatic service denial.
5. Run `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace`.
6. Treat accessibility and usability as acceptance criteria.
7. Submit changes through pull requests for review.

By contributing code or documentation, you agree it can be distributed under the repository's AGPL-3.0-only license; do not contribute material you lack permission to license. You retain copyright in your contributions unless separately agreed. Contributors should not upload SSA proprietary assets or third-party training materials without an appropriate license.
