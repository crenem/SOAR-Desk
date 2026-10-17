# Native Windows 11 preview — Tauri 2 (x86-64)

**Unsigned development proof-of-build, synthetic data only.** Not production software, a PHI-approved deployment, an SSA filing service, or a migration of the existing Ubuntu/WSL2 installation.

## What this build does

- Packages the existing Rust + Tauri 2 + React workbench directly for Windows 11 using WebView2; no WSLg.
- Generates a Windows NSIS installer and Start menu entry using a separate development-preview application identity.
- Uses `%LOCALAPPDATA%\SOAR Desk\operator.json` for a **new**, per-user Windows login. Existing WSL operator credentials are unchanged.
- Opens the system browser, rather than a Linux launcher, for optional ZITADEL PKCE login.
- Maintains the Rust encrypted-vault format, but **does not** import or move old vaults automatically.

**Intentionally unsupported in this preview:** bundled Laya, Qwen/CUDA inference, Windows PDF rendering, and restricted-case OCR. Restricted OCR deliberately fails closed on Windows because Linux `/dev/shm` protection has no approved Windows replacement yet. The UI must not imply those capabilities are working. No role authorization, independently anchored audit, or production credential control is asserted.

## Build on Windows 11

Requirements: Rust stable with MSVC x86-64 target, Microsoft C++ Build Tools ("Desktop development with C++"), Node.js LTS + npm, Git and WebView2 (normally installed on Windows 11).

Open native **PowerShell** — not WSL:

```powershell
git clone https://github.com/crenem/SOAR-Desk.git
cd SOAR-Desk
git switch feature/windows-native-tauri-preview
cd apps\desktop
npm install
npm run tauri -- build --config src-tauri/tauri.windows.conf.json --bundles nsis
```

NSIS installer output is expected under `apps\desktop\src-tauri\target\release\bundle\nsis\`.

Alternatively, review the branch's **Windows native Tauri preview (unsigned)** GitHub Actions run. When the job succeeds, download its `soar-desk-windows-x64-unsigned-preview` artifact from the run's Artifacts section. CI is an automated build/test gate, not a signed distribution or security certification.

## Windows acceptance checklist (fictional data only)

1. Install the unsigned preview on a disposable test profile. Do not bypass workplace restrictions or use any real applicant information.
2. Launch from Start, confirm native window controls, keyboard focus, screen scaling, and navigation.
3. Enroll a fictional local operator, sign out/in, lock on inactivity, and verify the Windows account persists across restarts without adopting WSL credentials.
4. Complete synthetic interview fields, screening, form progress and section/missing-field navigation.
5. Confirm unavailable Laya, Qwen and PDF features explain their limitations. Restricted OCR must fail closed without writing intermediate plaintext files.
6. With a disposable fictional vault, test encrypted save, reopen, backup and recovery using distinct secrets. Never overwrite a WSL vault or test restore on the only copy.
7. Test the optional ZITADEL browser callback with a trusted test tenant and validate unknown subjects remain denied.
8. Test uninstall/reinstall and data recovery; no auto-updater or data migration is provided.

## Work remaining for a real Windows release

Package/test Windows-native local Qwen CUDA and CPU inference; choose safe Windows OCR/PDF execution that does not leave vulnerable plaintext scratch; rework bundled Python sidecars; audit Windows per-user ACLs and credential key lifecycle; verify encrypted vault backup/restore end to end; implement organizational roles, audit/retention, full SSA mappings and accepted signing/filing workflows; complete code signing, install/uninstall and upgrades with rollback tests, and an independent privacy/security review.

The Ubuntu/WSL2 development application remains a separate supported development path. This branch is not ready for real client or PHI processing.
