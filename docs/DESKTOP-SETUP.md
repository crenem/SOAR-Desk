# Desktop Preview Setup (synthetic data only)

## Requirements
- Rust toolchain and Tauri 2 platform prerequisites: https://v2.tauri.app/start/prerequisites/
- Node.js LTS and npm.
- On Windows: Microsoft C++ Build Tools and WebView2, per Tauri's prerequisites.

## Launch
```powershell
cd apps/desktop
npm install
npm run tauri dev
```

The interface uses in-memory React state and Rust IPC calls. **There is no database, file storage, authentication, encryption, or autosave.** Do not enter client information.

## Architecture
- UI: `apps/desktop/src/App.tsx` (semantic form labels, fieldsets, keyboard-friendly navigation, skip link, live status, error alerts)
- IPC: Tauri command `evaluate_screen` maps UI payloads to `soar-core::screening::AdultReferralScreen` and invokes `recommend()`.
- Human-review IPC: `validate_human_review` checks reviewer code and rationale. Results are not stored.
- No filesystem plugins or HTTP API are provided.

## Manual accessibility test checklist
1. Navigate the full form with Tab, Shift+Tab, Space, and Enter.
2. Verify focus-visible indicators and complete labels with a screen reader.
3. Verify error text is announced via role=alert and recommendations via role=status.
4. Check contrast, browser zoom/200% scaling, and reduced-motion preferences.
5. Confirm the demo-only warning is visible on every step.

## Known limitations
Screening logic remains a preliminary prototype, not an SSA decision model. No production deployment or clinical validation is authorized. A usable icon, installer packaging, storage encryption, audit logging, testing of keyboard flow and independent security review are future work.
