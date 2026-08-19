.PHONY: install build test integration-test package verify-changelog release-prepare website-install website-build website-test website clean

install:
	cd extension && npm ci
	cd website && npm ci

build:
	cd extension && npm run build

test:
	cd extension && npm run typecheck
	cd extension && npm test

integration-test:
	cd extension && npm run test:integration

package:
	cd extension && npm run package
	@for archive in extension/cloudflare-d1-studio-*.vsix; do unzip -t "$$archive"; done

verify-changelog:
	REQUIRE_CHANGELOG_ALWAYS=true ENFORCE_UNRELEASED_BULLET=true .github/scripts/check-unreleased-changelog.sh

release-prepare:
	@test -n "$(version)" || (echo "Usage: make release-prepare version=X.Y.Z [dryrun=true]" && exit 2)
	.github/scripts/release.sh "$(version)" "$(if $(dryrun),$(dryrun),false)"

website-install:
	cd website && npm ci

website-build:
	cd website && npm run build

website-test:
	cd website && npm test

website: website-build
	cd website && npm run serve

clean:
	rm -rf extension/dist extension/.vscode-test extension/coverage website/dist
