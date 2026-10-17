# SOAR Desk

**Open-source, local-first SSI/SSDI application preparation for nonprofit practitioners.**

SOAR Desk is an AGPL-3.0 Rust/Tauri 2 + React desktop workbench inspired by the SOAR (SSI/SSDI Outreach, Access, and Recovery) practice model. It organizes applicant interviews, selected SSA form crosswalks, medical evidence review, encrypted local case files, manual submission tracking and nonprofit recovery access.

**Release status: restricted development beta — NOT a production-certified case-management system or SSA filing service.** The current build supports encrypted local `CASE-UUID` cases with a separate nonprofit recovery credential; it does **not** yet provide organizational login, production authorization, SQLCipher, complete SSA form mappings, independently anchored audit trails, full document-retention controls or an assessed PHI security program. Local-case mode requires explicit nonprofit authorization and privacy-risk acknowledgment. Do not assume suitability for handling regulated records merely because a PDF filing channel transmits plaintext.

## Implemented practitioner features

- Native-function Minimize, Maximize/Restore, Close and draggable custom desktop title bar.
- Live expandable **form → section → missing field** navigation beneath Application Preparation, with direct jump/focus and conditional question coverage.
- Guided partial interviews for SSA-16, SSA-8000-BK, SSA-3368-BK, SSA-827, SSA-3369-BK, SSA-3373-BK. SSA-8001-BK remains reference-only.
- Encrypted whole-case snapshot with automatic 10-second changed-data saves, immediate Save now, encrypted previous version, optional encrypted backup, and nonprofit-held recovery key slot.
- Local single-operator sign-in with a protected Argon2id password verifier, 15-minute inactivity lock, native case IPC authorization, and a manual Lock action. Operator credentials never replace separate per-case encryption passphrases; passkeys/Windows Hello are not yet implemented.
- Distinct training `SYN-` case v1 and restricted local `CASE-UUID` v2 formats. Both use a random vault master key, authenticated AES-256-GCM and independently Argon2id-wrapped practitioner and recovery credentials. Plaintext is not automatically saved on disk by the case snapshot workflow.
- Document text extraction/OCR and local AI-assisted clinical *suggestions* using Laya and Qwen, followed by human review of source quotes. Verified explicitly labeled identity/measurement fields can be proposed as prefills without overwriting answered fields.
- Signature drawing or typed-name **internal acknowledgment** linked to the selected form/case SHA-256 fingerprint and signer intent. This is **NOT** an SSA-approved e-signing method or legal SSA-827 signature.
- Review-only **SSA-16 (09-2025) PDF** rendering from a strictly verified original blank PDF. Training copies are conspicuously marked fictional; local case exports are marked **UNSIGNED — INCOMPLETE WORKING DRAFT**, do not populate signature/bank/SSA-only fields, and are not filed electronically.
- A manual receipt/submission status log. The application does not transmit to SSA or make eligibility determinations.

Read the [workbench release checklist](docs/WORKBENCH-RELEASE-STATUS.md) before using restricted local-case mode.

## Quick start (Windows on ARM64 via Ubuntu WSL2)

Use the existing SOAR Desk Windows shortcut, which executes `scripts/launch-wsl.sh`. This launcher updates `main`, verifies installed local dependencies, checks the GenieX text-generation service, starts CPU fallback only when needed, and runs Tauri in development mode.

Inside **Application Preparation** choose **New restricted local case** (opaque UUID), then **Create encrypted case**. Use independent practitioner and nonprofit recovery passwords. Do not place real names, SSNs, or DOBs in a vault filename or path. Case edits are saved every 10 seconds only while a writable encrypted vault remains unlocked. Protect both the vault and the organizational recovery secret under nonprofit policy.

To enable the SSA-16 PDF working preview, download the original blank SSA-16 (09-2025) from https://www.ssa.gov/forms/ssa-16-bk.pdf using a browser. In **SSA exports**, choose **Install SSA-16 PDF from file…**. SOAR Desk verifies its SHA-256 fingerprint before installing; it refuses unknown revisions rather than silently mapping incorrect widgets.

The development build should not be confused with a signed Windows installer or a HIPAA-assessed deployment.

## Windows x86-64 with NVIDIA CUDA

For a Windows 11 PC with Ubuntu 24.04 WSL2 and an NVIDIA GPU, run `scripts/create-windows-cuda-shortcut.ps1` from Windows PowerShell. It creates a desktop shortcut named **SOAR Desk - NVIDIA CUDA**, using `scripts/launch-wsl-cuda.sh` instead of the Qualcomm GenieX startup path. The shortcut can clone the repository on its first use. The CUDA launcher builds a GPU-enabled local llama.cpp server and starts the Qwen3 4B model on loopback before launching the existing Tauri workbench.

Prerequisites: NVIDIA Windows driver/WSL GPU access, a CUDA toolkit containing `nvcc` in Ubuntu, and the normal Tauri, Rust, Node, Python and OCR dependencies. The shortcut does not bypass those requirements. A successful model health response does not prove CUDA offloading: verify the llama.cpp output and `nvidia-smi` during synthetic inference. This remains a development beta, not an approved PHI deployment. Complete a synthetic end-to-end test using the [Windows x86-64 / CUDA release acceptance checklist](docs/RELEASE-ACCEPTANCE-WINDOWS-CUDA.md) before attempting organizational pilot evaluation.

For enrollment, password storage, lock behavior and future passkey limitations, see [local operator access](docs/OPERATOR-ACCESS.md).

Optional **ZITADEL federated sign-in** is available through native OIDC Authorization Code + PKCE, verified signed ID tokens, and explicit linking to the existing single-operator SOAR profile. Configure an approved ZITADEL **Native** application in **Profile & ZITADEL**. The local password continues working offline, and a linked external identity never unlocks the independent encrypted case keys. Setup: [ZITADEL Native app and account linking](docs/ZITADEL-SETUP.md). ZITADEL cloud tenancy and OIDC registration are not provisioned by this repository.

## Native Windows 11 preview (x86-64)

An **unsigned, fictional-data-only** Windows Tauri installer is under development without WSLg. It keeps Rust and React and does **not** yet bundle Laya, Qwen/CUDA, PDF rendering or restricted OCR. The existing WSL2 installation and vaults remain untouched. See the [native Windows preview guide](docs/WINDOWS-NATIVE-PREVIEW.md).

## Development checks

```bash
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cd apps/desktop
npm install
npm run test:workflow
npm run test:forms
npm run test:fields
npm run test:auth
npm run test:package
npm run test:submissions
npm run build
```

GitHub Actions also compiles and tests the native Tauri bridge with the required Linux GTK/WebKit dependencies.

## Known release blockers

Completing a **fully usable organizational release** still requires verified mappings for all official forms, finalized paper/electronic signing and filing pathways, encrypted original attachments and recoverable backups, role-based case permissions, secure Windows credential handling, audit/retention and privacy assessment, full restore testing and platform packaging. See [the status checklist](docs/WORKBENCH-RELEASE-STATUS.md) and [production architecture](docs/PRODUCTION-VAULT-ADR.md). Do not misrepresent working PDF previews, internal signatures or staff-entered receipts as SSA-accepted filings.

## Privacy and licensing

Never open a GitHub issue, pull request, or diagnostic containing client data or credentials. Test fixtures in this public repository must remain invented or irreversibly synthetic. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

Software license: **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. Third-party official forms, agency material, trademarks, and SOAR/PRA content retain their respective rights. SOAR Desk is an independent community project, not affiliated with or endorsed by SSA, SAMHSA or Policy Research Associates.
