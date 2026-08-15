#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  exit 2
fi

version="$1"
section_header="## [${version}]"

section_body="$(awk -v version="$version" '
  $0 ~ "^## \\[" version "\\]([[:space:]]|$)" { in_section = 1; next }
  /^## \[/ && in_section { exit }
  in_section { print }
' CHANGELOG.md)"

if [[ -z "${section_body//[[:space:]]/}" ]]; then
  echo "ERROR: Missing or empty changelog section '${section_header}'." >&2
  exit 1
fi

if ! grep -qE '^[[:space:]]*- ' <<<"$section_body"; then
  echo "ERROR: Section '${section_header}' must contain a bullet." >&2
  exit 1
fi

if ! grep -q '\*\*Full Changelog\*\*:' <<<"$section_body"; then
  echo "ERROR: Section '${section_header}' must contain a full changelog link." >&2
  exit 1
fi

printf '%s\n' "$section_body"
