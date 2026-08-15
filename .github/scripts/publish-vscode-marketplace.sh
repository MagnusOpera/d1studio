#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${VSCE_TOKEN:-}" ]]; then
  echo "Missing VSCE_TOKEN."
  exit 1
fi

vsix_files=(./*.vsix)
if [[ ! -e "${vsix_files[0]}" || "${#vsix_files[@]}" -ne 1 ]]; then
  echo "Expected exactly one VSIX release asset."
  exit 1
fi

vsix_file="${vsix_files[0]}"
echo "Publishing ${vsix_file} to the VS Code Marketplace."
set +e
output="$(vsce publish --packagePath "$vsix_file" --pat "$VSCE_TOKEN" 2>&1)"
status=$?
set -e
printf '%s\n' "$output"

if [[ "$status" -eq 0 ]]; then
  exit 0
fi

if grep -Eiq 'already exists|already published|version .* exists|conflict.*(version|publish|extension)' <<<"$output"; then
  echo "This extension version is already published; treating the operation as successful."
  exit 0
fi

exit "$status"
