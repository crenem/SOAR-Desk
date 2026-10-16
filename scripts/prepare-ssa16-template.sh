#!/usr/bin/env bash
# Cache only the official 09-2025 SSA-16 template. Does not send client data.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/.local/ssa-templates"
PDF="$DEST/ssa-16-bk.pdf"
URL="https://www.ssa.gov/forms/ssa-16-bk.pdf"
mkdir -p "$DEST"
if [[ -f "$PDF" ]]; then
  if [[ "$(head -c 5 "$PDF")" != "%PDF-" ]] || ! pdftotext -f 1 -l 1 "$PDF" - | grep -q 'SSA-16 (09-2025)'; then
    echo "Existing SSA-16 template has a different version or is invalid. Refusing to replace it." >&2
    exit 1
  fi
  echo "Verified cached SSA-16 (09-2025) template."
  exit 0
fi
TMP="$(mktemp "$DEST/.ssa-16-XXXXXX.pdf")"
trap 'rm -f "$TMP"' EXIT
curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 120 "$URL" -o "$TMP"
if [[ "$(head -c 5 "$TMP")" != "%PDF-" ]] || ! pdftotext -f 1 -l 1 "$TMP" - | grep -q 'SSA-16 (09-2025)'; then
  echo "SSA form has changed or was not a readable 09-2025 SSA-16. Nothing installed." >&2
  exit 1
fi
mv -n "$TMP" "$PDF"
trap - EXIT
sha256sum "$PDF" | tee "$PDF.sha256"
echo "Cached the unchanged official SSA-16 at $PDF"
