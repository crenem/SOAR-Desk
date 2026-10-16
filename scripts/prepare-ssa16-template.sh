#!/usr/bin/env bash
# Install only the EXACT reviewed, unmodified, blank SSA-16 (09-2025).
# Pass a local PDF path (recommended), or try the official URL on demand.
# The normal launcher no longer retries SSA 403 failures.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/.local/ssa-templates"
PDF="$DEST/ssa-16-bk.pdf"
URL="https://www.ssa.gov/forms/ssa-16-bk.pdf"
EXPECTED_SHA256="09c088cbbf688b2e14a1061d2ff31cd481344de2ba5eacfac030f61045ba548e"
if (( $# > 1 )); then
  echo "Usage: bash scripts/prepare-ssa16-template.sh [path/to/original-blank-ssa-16.pdf]" >&2
  exit 2
fi
mkdir -p "$DEST"
verify_pdf() {
  local file="$1" actual
  [[ -f "$file" ]] || return 1
  [[ "$(head -c 5 "$file")" == "%PDF-" ]] || return 1
  actual="$(sha256sum "$file" | cut -d ' ' -f1)"
  [[ "$actual" == "$EXPECTED_SHA256" ]]
}
if [[ -e "$PDF" ]]; then
  if ! verify_pdf "$PDF"; then
    echo "Template cache contains an UNRECOGNIZED SSA-16 PDF; refusing to replace it." >&2
    exit 1
  fi
  echo "Verified exact reviewed SSA-16 (09-2025) already cached."
  exit 0
fi

TMP="$(mktemp "$DEST/.ssa-16-XXXXXX.pdf")"
trap 'rm -f "$TMP"' EXIT
if (( $# == 1 )); then
  if [[ ! -f "$1" ]]; then
    echo "Selected local PDF file does not exist: $1" >&2
    exit 1
  fi
  cp -- "$1" "$TMP"
else
  echo "Requesting the official SSA-16 PDF (browser download is an alternative)..."
  if ! curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 10 --max-time 120 "$URL" -o "$TMP"; then
    echo "SSA may block automated downloads (HTTP 403). Use your browser to download:" >&2
    echo "  $URL" >&2
    echo "Then in SOAR Desk: Draft package -> Install SSA-16 PDF from file." >&2
    echo "Or run: bash scripts/prepare-ssa16-template.sh /path/to/downloaded/ssa-16-bk.pdf" >&2
    exit 1
  fi
fi
if ! verify_pdf "$TMP"; then
  echo "Source is not the EXACT reviewed, blank SSA-16 (09-2025) file." >&2
  echo "A changed edition or re-saved PDF requires a new form-mapping review." >&2
  exit 1
fi
# Never overwrite preexisting cache contents, even if another installer won
# a race while the user was selecting a PDF.
if [[ -e "$PDF" ]]; then
  echo "The template was installed concurrently; review the cached copy." >&2
  exit 1
fi
mv -n "$TMP" "$PDF"
trap - EXIT
if ! verify_pdf "$PDF"; then
  echo "Post-installation verification failed." >&2
  exit 1
fi
sha256sum "$PDF" | tee "$PDF.sha256"
echo "Reviewed SSA-16 form ready at $PDF"
