#!/usr/bin/env bash
# Provision *unaltered* public SSA PDFs for offline synthetic-only form research.
# This utility never sends case data, fills PDFs, or opens a client record.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.local/ssa-templates"
mkdir -p "$OUT"
declare -A URLs=(
  [ssa-3368-bk.pdf]="https://www.ssa.gov/forms/ssa-3368-bk.pdf"
  [ssa-827.pdf]="https://www.ssa.gov/forms/ssa-827.pdf"
  [ssa-3369.pdf]="https://www.ssa.gov/forms/ssa-3369.pdf"
  [ssa-3373-bk.pdf]="https://www.ssa.gov/forms/ssa-3373-bk.pdf"
  [ssa-8000-bk.pdf]="https://www.ssa.gov/forms/ssa-8000-bk.pdf"
  [ssa-16-bk.pdf]="https://www.ssa.gov/forms/ssa-16-bk.pdf"
  [ssa-8001-bk.pdf]="https://www.ssa.gov/forms/ssa-8001-bk.pdf"
)
tmp_manifest="$(mktemp)"
trap 'rm -f "$tmp_manifest"' EXIT
printf 'filename\tsha256\tbytes\tsource\n' > "$tmp_manifest"
for name in $(printf '%s\n' "${!URLs[@]}" | sort); do
  url="${URLs[$name]}"
  dest="$OUT/$name"
  if [[ -f "$dest" ]]; then
    echo "Already cached: $name (remove intentionally to fetch another edition)"
  else
    scratch="$(mktemp "$OUT/.download-XXXXXX")"
    if ! curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --max-time 120 "$url" -o "$scratch"; then
      rm -f "$scratch"
      echo "Failed to retrieve $name from SSA; existing templates not modified." >&2
      exit 1
    fi
    if [[ "$(head -c 5 "$scratch")" != "%PDF-" ]]; then
      rm -f "$scratch"
      echo "Invalid PDF header for $name. Nothing installed." >&2
      exit 1
    fi
    mv "$scratch" "$dest"
    echo "Cached unchanged SSA download: $name"
  fi
  sum="$(sha256sum "$dest" | cut -d' ' -f1)"
  bytes="$(wc -c < "$dest" | tr -d ' ')"
  printf '%s\t%s\t%s\t%s\n' "$name" "$sum" "$bytes" "$url" >> "$tmp_manifest"
done
mv "$tmp_manifest" "$OUT/manifest.tsv"
trap - EXIT
echo "SHA-256 inventory written to $OUT/manifest.tsv"
echo "Do not use these forms to claim SSA approval, a signature, or submission."
