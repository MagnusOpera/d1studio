# Cloudflare D1 Studio

This repository contains the Cloudflare D1 Studio VS Code extension and its website.

- [`extension/`](extension/) — TypeScript extension, tests, and VSIX packaging.
- [`website/`](website/) — dependency-free static product website for GitHub Pages.
- [`CHANGELOG.md`](CHANGELOG.md) — user-facing release history and current unreleased work.
- [`AGENTS.md`](AGENTS.md) — contributor, testing, and release requirements.

## Development

```sh
make install
make build
make test
make integration-test
make package
make website-build
make website
```

The packaged VSIX is written under `extension/`. Integration tests download and launch a VS Code test instance; on headless Linux they run through `xvfb-run -a` in CI.

## Release model

Run `make release-prepare version=X.Y.Z`, push the resulting commit and numeric tag, and wait for CI to create a draft GitHub release. Publishing that existing draft publishes its VSIX to both the VS Code Marketplace and Open VSX.

See [AGENTS.md](AGENTS.md) for the complete release and changelog contract.

## Website deployment

After the first `main` push, select **GitHub Actions** as the repository's Pages source once, then run the **Publish website** workflow. It builds `website/dist` and deploys the artifact to <https://magnusopera.github.io/d1studio/>.
