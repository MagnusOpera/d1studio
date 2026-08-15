#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <version> [dryrun]"
  exit 2
fi

version="$1"
dryrun="${2:-false}"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Invalid version '$version'. Expected X.Y.Z."
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$dryrun" != "true" && -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit or stash changes before preparing a release."
  exit 1
fi

if git rev-parse -q --verify "refs/tags/${version}" >/dev/null; then
  echo "ERROR: Tag '${version}' already exists."
  exit 1
fi

if grep -q "^## \[${version}\]" CHANGELOG.md; then
  echo "ERROR: CHANGELOG section '${version}' already exists."
  exit 1
fi

unreleased_body="$(awk '
  $0 == "## [Unreleased]" { in_section = 1; next }
  /^## \[/ && in_section { exit }
  in_section { print }
' CHANGELOG.md)"

if [[ -z "${unreleased_body//[[:space:]]/}" ]] || ! grep -qE '^[[:space:]]*- ' <<<"$unreleased_body"; then
  echo "ERROR: Unreleased must contain at least one bullet."
  exit 1
fi

previous_version="$(node - "$version" <<'NODE'
const fs = require('node:fs');
const target = process.argv[2].split('.').map(Number);
const versions = [...fs.readFileSync('CHANGELOG.md', 'utf8').matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)]
  .map((match) => match[1])
  .filter((value) => {
    const parts = value.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (parts[index] !== target[index]) return parts[index] < target[index];
    }
    return false;
  })
  .sort((left, right) => {
    const a = left.split('.').map(Number); const b = right.split('.').map(Number);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
process.stdout.write(versions.at(-1) ?? '');
NODE
)"

if [[ -z "$previous_version" ]]; then
  echo "ERROR: Could not determine a previous version from CHANGELOG.md."
  exit 1
fi

remote_url="$(git remote get-url origin)"
if [[ "$remote_url" =~ github.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
  repo_slug="${BASH_REMATCH[1]}"
else
  echo "ERROR: Could not parse a GitHub repository from '$remote_url'."
  exit 1
fi

compare_link="**Full Changelog**: https://github.com/${repo_slug}/compare/${previous_version}...${version}"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
updated_changelog="${temporary_directory}/CHANGELOG.md"
unreleased_file="${temporary_directory}/unreleased.md"
printf '%s\n' "$unreleased_body" > "$unreleased_file"

awk -v version="$version" -v body_file="$unreleased_file" -v link="$compare_link" '
  $0 == "## [Unreleased]" {
    print
    print ""
    print "## [" version "]"
    print ""
    while ((getline line < body_file) > 0) print line
    close(body_file)
    print link
    print ""
    skipping = 1
    next
  }
  skipping && /^## \[/ { skipping = 0 }
  !skipping { print }
' CHANGELOG.md > "$updated_changelog"

if ! grep -q "^## \[${version}\]$" "$updated_changelog" || ! grep -qF "$compare_link" "$updated_changelog"; then
  echo "ERROR: Failed to materialize the ${version} changelog section."
  exit 1
fi

if [[ "$dryrun" == "true" ]]; then
  echo "[DRY RUN] Would release ${version} after ${previous_version}."
  echo "[DRY RUN] ${compare_link}"
  exit 0
fi

cp "$updated_changelog" CHANGELOG.md
(cd extension && npm version "$version" --no-git-tag-version --allow-same-version)

git add CHANGELOG.md extension/package.json extension/package-lock.json
git commit -m "chore(release): ${version}"
git tag -a "$version" -m "Release ${version}"

echo "Release ${version} prepared. Push it with: git push origin main --follow-tags"
