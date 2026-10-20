#!/usr/bin/env bash
# Dedicated, self-updating LOCAL-ONLY SOAR Desk development launcher.
# Existing ~/Projects/SOAR-Desk and its Windows shortcut are never modified.
set -Eeuo pipefail

DEV_ROOT="${SOAR_DEV_ROOT:-$HOME/Projects/SOAR-Desk-SSA}"
DEV_BRANCH="development/local"

if [[ ! -d "$DEV_ROOT" || ! -f "$DEV_ROOT/scripts/launch-wsl.sh" ]]; then
  echo "SOAR Desk development worktree not found at: $DEV_ROOT" >&2
  echo "Create or update ~/Projects/SOAR-Desk-SSA from origin/development/local first." >&2
  exit 1
fi
if [[ ! -d "$DEV_ROOT/.git" && ! -f "$DEV_ROOT/.git" ]]; then
  echo "The development directory is not a Git worktree; refusing to launch." >&2
  exit 1
fi

actual_branch="$(git -C "$DEV_ROOT" symbolic-ref --quiet --short HEAD || true)"
if [[ "$actual_branch" != "$DEV_BRANCH" ]]; then
  echo "Wrong development branch: ${actual_branch:-detached HEAD}" >&2
  echo "Expected '$DEV_BRANCH'. No branch switch was attempted to protect local work." >&2
  exit 1
fi

# Keep the single-user operator credential and platform app data separate.
# Case vaults are file-picker-selected and MUST use different development paths.
umask 077
profile="$HOME/.local/share/soar-desk-development-profile"
mkdir -p "$profile/config" "$profile/data" "$profile/cache" "$DEV_ROOT/.local/training-cases"
chmod 700 "$profile" "$profile/config" "$profile/data" "$profile/cache" "$DEV_ROOT/.local/training-cases"
export XDG_CONFIG_HOME="$profile/config"
export XDG_DATA_HOME="$profile/data"
export XDG_CACHE_HOME="$profile/cache"

export SOAR_DESK_ROOT="$DEV_ROOT"
export SOAR_DESK_UPDATE_BRANCH="$DEV_BRANCH"
export SOAR_DESK_DEVELOPMENT=1
export SOAR_DESK_VITE_PORT=1421

accel="${SOAR_DEV_ACCELERATOR:-auto}"
case "$accel" in
  auto)
    echo "== SOAR Desk - Development (isolated profile / GenieX or local CPU fallback) =="
    exec bash "$DEV_ROOT/scripts/launch-wsl.sh"
    ;;
  cuda)
    echo "== SOAR Desk - Development (isolated profile / NVIDIA CUDA) =="
    exec bash "$DEV_ROOT/scripts/launch-wsl-cuda.sh"
    ;;
  *)
    echo "Unknown accelerator '$accel'. Use auto or cuda." >&2
    exit 2
    ;;
esac
