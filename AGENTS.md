# AGENTS

This file defines contributor expectations for building, testing, regression safety, website maintenance, and releases.

## Repository Layout

- `extension/` contains the VS Code extension, unit tests, integration tests, and VSIX packaging.
- `website/` contains the static GitHub Pages website.
- `.github/scripts/` contains changelog and publishing automation.
- `.github/workflows/` contains CI, Pages, and release workflows.

## Build, Test, and Non-Regression

Run these commands before opening or updating a pull request:

- Install: `make install`
- Build: `make build`
- Type checking and unit tests: `make test`
- VS Code integration tests: `make integration-test`
- VSIX packaging and archive smoke test: `make package`
- Website build: `make website-build`

Every feature must include automated coverage. Every bug fix must include a regression test reproducing the prior failure. Keep builds warning-free and test the smallest relevant surface while developing, then run the full suite before handoff.

## Release Notes (Unreleased)

- `CHANGELOG.md` must keep a top `## [Unreleased]` section.
- Every regular commit targeting `main` must add at least one short, single-line, user-facing bullet under `Unreleased`.
- Documentation, process, policy, dependency, and CI changes are not exempt.
- Release commits named `chore(release): X.Y.Z` may leave `Unreleased` empty.
- Every released version section ends with a full-changelog link.
- Run `make verify-changelog` before committing.

## Release Process

Follow this sequence for every release:

1. Run `make release-prepare version=X.Y.Z` (or add `dryrun=true` to preview).
2. Push the release commit and tag together with `git push origin main --follow-tags`.
3. Wait for the numeric-tag workflow to build, test, package, and create a **draft** GitHub release.
4. Confirm the draft notes came from `CHANGELOG.md` and that the VSIX is attached.
5. Publish that existing draft. Do not create a separate release manually.
6. The release-published workflow sends the attached VSIX to the VS Code Marketplace and Open VSX.

The repository secrets are `VSCE_TOKEN` and `OPEN_VSX_TOKEN`. Tag CI is the source of truth for artifacts; do not publish a locally built VSIX as a release artifact.

## Pull Request Checklist

- Extension build and type checking pass.
- Unit and VS Code integration tests pass.
- The packaged VSIX passes its archive smoke test.
- Website changes build successfully and remain responsive and accessible.
- New or fixed behavior is covered by tests.
- `CHANGELOG.md` contains a concise `Unreleased` bullet.
- Documentation reflects any user-visible or architectural change.

Direct commits to `main` have the same quality bar as pull requests.
