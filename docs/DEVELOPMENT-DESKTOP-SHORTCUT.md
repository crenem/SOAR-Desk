# SOAR Desk - Development Desktop Shortcut (WSL2)

**Purpose:** Launch the current, tested local-development integration branch in a completely separate Ubuntu worktree from the older desktop shortcut. **This is still a restricted development beta. Use fictional cases only; this feature has not passed a production PHI security review.**

## Branches, locations and update boundaries

| Shortcut | Git worktree | Target Git branch | Profile |
| --- | --- | --- | --- |
| Existing SOAR Desk or SOAR Desk - NVIDIA CUDA | `~/Projects/SOAR-Desk` | `main` | Existing operator/profile |
| **SOAR Desk - Development** | `~/Projects/SOAR-Desk-SSA` | **`development/local`** | Separate operator/profile |

The **development/local** branch is a rolling *integration branch*. It currently includes the stacked local-only workflow and Epic #4 source/semantic review changes through draft PR #12, plus the development launcher. **New PRs are not picked up automatically until we deliberately advance this branch.** At each launch, the script fetches that branch and allows only a fast-forward update. If tracked files have uncommitted modifications, updates are skipped and the checkout is not overwritten. An unexpected branch stops the launch rather than changing branches.

The existing shortcut, source repository, and original operator credentials are not modified.

## Installation — one time (from Ubuntu WSL)

First close any running SOAR Desk dev process. You have already prepared `~/Projects/SOAR-Desk-SSA`, the downloaded blank SSA PDFs and the WSL Python virtual environment; don't recreate those.

```bash
cd ~/Projects/SOAR-Desk-SSA
git status --short
git fetch origin

# Stop if Git says local modifications would be overwritten.
git switch -c development/local --track origin/development/local

# Install a distinct shortcut onto your Windows Desktop.
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File "$(wslpath -w "$PWD/scripts/create-windows-development-shortcut.ps1")"
```

By default this creates **SOAR Desk - Development** and starts the Windows **GenieX** helper if available; Ubuntu falls back to the local CPU server if a real generation probe fails. This is the recommended option on Windows ARM64.

For your separate NVIDIA/CUDA-capable x86-64 machine, run the installer with:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File "$(wslpath -w "$PWD/scripts/create-windows-development-shortcut.ps1")" \
  -Accelerator Cuda
```

The second command updates ONLY the *development* shortcut to use the existing NVIDIA CUDA launcher. The driver, CUDA toolkit, and llama.cpp backend must already be installed as described in the CUDA setup. The original CUDA shortcut remains unchanged.

## What happens on double click

1. Windows starts `Ubuntu-24.04` and, for Auto mode, optionally starts your local Windows GenieX server.
2. Invokes `~/Projects/SOAR-Desk-SSA/scripts/launch-development.sh`.
3. Requires the **development/local** branch; refuses detached or unrelated branches.
4. Uses separate XDG config/data/cache folders under `~/.local/share/soar-desk-development-profile/`. New operator enrollment is expected; your original login is not copied.
5. Fetches `origin/development/local` and fast-forwards when safe (if offline, uses the checked-out revision). No `git reset`, forced checkout, stash, or destructive `git clean`.
6. Installs missing system tools, Rust/Node dependencies, and a small Python document-processing environment in the development worktree as needed. **The development-only path skips downloading/provisioning Laya.** Qwen and the original OCR pipeline are used instead.
7. Launches `SOAR Desk - Development`, with distinct Tauri app identity `org.soardesk.community.development` and Vite UI port **1421** (the original build uses 1420).

The underlying local inference service may be shared on loopback (GenieX port 18181 / llama.cpp port 8080). This is expected; it does not imply independent models for each desktop window. Avoid sharing the same case between both builds.

### Where data lives

- Dev operator config: `~/.local/share/soar-desk-development-profile/config/soar-desk/operator.json`
- Dev WebView app ID: `org.soardesk.community.development`
- Dev source/PDF cache: `~/Projects/SOAR-Desk-SSA/.local/`
- **Suggested fictional training-case directory:** `~/Projects/SOAR-Desk-SSA/.local/training-cases/`

SOAR Desk's encrypted case files are explicitly selected using the file picker, so **a separate app profile alone does not prevent a user from manually opening an existing real case file**. To keep the original case data untouched, select or create only synthetic training cases in the suggested directory. Do not import actual PHI into either development interface.

## Testing / troubleshooting

Check branch, source and launcher syntax in Ubuntu:

```bash
cd ~/Projects/SOAR-Desk-SSA
git status --short
git branch --show-current
bash -n scripts/launch-development.sh scripts/launch-wsl.sh scripts/launch-wsl-cuda.sh
```

Expected branch: `development/local`. If `git switch` or `git merge --ff-only` says local work would be overwritten or diverged, **stop and inspect rather than resetting**. Check developer logs in `~/.local/state/soar-desk/` and Windows `%LOCALAPPDATA%\SOAR Desk\logs`.

When developing a new feature branch, do so in a **different Git worktree** or temporarily close the development shortcut; this shortcut intentionally refuses to launch anything other than the designated integration branch.

To regenerate/update the Windows shortcut later, rerun the PowerShell installer on `development/local`. Re-running doesn't affect old shortcut names or case files.

**Project note:** The current canonical SSA semantic mapping remains provisional and may not populate forms. The separate shortcut provides access to the most recently integrated development implementation, not proof of SSA submission readiness.
