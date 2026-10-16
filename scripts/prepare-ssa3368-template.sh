#!/usr/bin/env bash
# Optional research step: cache official SSA-3368, edition 06-2024, unchanged.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/.local/ssa-templates"
PDF="$DEST/ssa-3368-bk.pdf"
URL="https://www.ssa.gov/forms/ssa-3368-bk.pdf"
mkdir -p "$DEST"
if [[ -f "$PDF" ]]; then
  [[ "$(head -c 5 "$PDF")" == "%PDF-" ]] && pdftotext -f 1 -l 1 "$PDF" - | grep -q 'SSA-3368-BK (06-2024)' \
    || { echo "Cached SSA-3368 has an unexpected edition; refusing to overwrite." >&2; exit 1; }
else
  TMP="$(mktemp "$DEST/.ssa-3368-XXXXXX.pdf")"
  trap 'rm -f "$TMP"' EXIT
  curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 120 "$URL" -o "$TMP"
  [[ "$(head -c 5 "$TMP")" == "%PDF-" ]] && pdftotext -f 1 -l 1 "$TMP" - | grep -q 'SSA-3368-BK (06-2024)' \
    || { echo "SSA-3368 version changed or PDF invalid; nothing installed." >&2; exit 1; }
  mv -n "$TMP" "$PDF"
  trap - EXIT
fi
"$ROOT/.venv-laya/bin/python" "$ROOT/scripts/inspect-ssa-template.py" "$PDF" --expected "SSA-3368-BK (06-2024)" > "$DEST/ssa-3368-widgets.json"
"$ROOT/.venv-laya/bin/python" "$ROOT/scripts/ssa3368-field-workbench.py" "$PDF" \
  --out-dir "$DEST/ssa3368-workbench" --render-pages 7
sha256sum "$PDF" | tee "$PDF.sha256"
echo "SSA-3368 source and pending-only crosswalk: $DEST/ssa3368-workbench/ssa3368-mapping-review.json"
