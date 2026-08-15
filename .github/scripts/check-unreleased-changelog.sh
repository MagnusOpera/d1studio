#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

base_ref="${GITHUB_BASE_REF:-}"
require_always="${REQUIRE_CHANGELOG_ALWAYS:-false}"
enforce_bullet="${ENFORCE_UNRELEASED_BULLET:-false}"

if [[ -n "$base_ref" ]]; then
  git fetch --no-tags --depth=1 origin "$base_ref" >/dev/null 2>&1 || true
  diff_range="origin/${base_ref}...HEAD"
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  diff_range="HEAD~1...HEAD"
else
  echo "No comparable git range available; skipping changelog check."
  exit 0
fi

changed_files="$(git diff --name-only "$diff_range")"
if [[ -z "$changed_files" ]]; then
  echo "No changed files detected; skipping changelog check."
  exit 0
fi

if ! grep -qx 'CHANGELOG.md' <<<"$changed_files"; then
  if [[ "$require_always" == "true" ]]; then
    echo "ERROR: CHANGELOG.md must be updated in every commit."
    exit 1
  fi

  if grep -Eq '^(extension|website)/' <<<"$changed_files"; then
    echo "ERROR: Extension or website changes require a CHANGELOG.md update."
    exit 1
  fi

  echo "No changelog-required files changed."
  exit 0
fi

if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  echo "ERROR: CHANGELOG.md must contain a top-level '## [Unreleased]' section."
  exit 1
fi

unreleased_block="$(awk '
  /^## \[Unreleased\]/{in_block=1; next}
  /^## \[/{if(in_block){exit}}
  in_block{print}
' CHANGELOG.md)"

if [[ -z "${unreleased_block//[[:space:]]/}" ]]; then
  head_subject="$(git log -1 --pretty=%s)"
  if [[ "$head_subject" =~ ^chore\(release\):\ [0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Changelog gate passed (release commits may leave Unreleased empty)."
    exit 0
  fi
  echo "ERROR: ## [Unreleased] is empty."
  exit 1
fi

if [[ "$enforce_bullet" == "true" ]] && ! grep -qE '^- ' <<<"$unreleased_block"; then
  echo "ERROR: ## [Unreleased] must contain a bullet beginning with '- '."
  exit 1
fi

echo "Changelog gate passed."
