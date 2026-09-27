# Cohere — one command for each thing you do.
#
#   make setup                  install node modules, git hooks (once per clone)
#   make dev                    run the app against its own dev library (same as `tdev` inside app/)
#   make dev-mock               browser-only UI with the in-memory backend → http://localhost:1420/?mock=1
#   make check                  typecheck · lint · vitest · cargo test
#   make e2e                    Playwright suite against the mock backend
#   make preflight              verify certificate, notary profile, updater key, tools
#   make build                  signed + notarized + stapled DMG → release/
#   make install                install the freshly built DMG into /Applications and launch it
#   make release VERSION=0.2.0  [NOTES="…"]  bump · check · build · changelog · commit · tag · push · GitHub Release
#   make uninstall              move /Applications/Cohere.app (+ data, asks) to the Trash
#   make clean                  remove build output (keeps node_modules and cargo cache)

SHELL := /bin/bash
APP   := app
S     := $(APP)/scripts
export PATH := $(HOME)/.cargo/bin:/Users/paris/user/root/installations/node-v22.12.0/bin:/opt/homebrew/bin:$(PATH)

.PHONY: help setup dev dev-mock check e2e preflight build install release uninstall clean

help:
	@sed -n '2,15p' Makefile | sed 's/^#//'

setup:
	@cd $(APP) && npm install --cache ~/.npm-cohere-cache
	@chmod +x $(S)/*.sh $(S)/hooks/*
	@mkdir -p .git/hooks && cp $(S)/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
	@echo "✓ node modules installed · pre-commit secret scan armed"

dev:
	@cd $(APP) && npx tauri dev

dev-mock:
	@cd $(APP) && npm run dev:mock

check:
	@cd $(APP) && npm run check

e2e:
	@cd $(APP) && PLAYWRIGHT_BROWSERS_PATH=$${PLAYWRIGHT_BROWSERS_PATH:-$(HOME)/Library/Caches/ms-playwright} npx playwright test

preflight:
	@$(S)/preflight.sh --release

build:
	@$(S)/build.sh

install:
	@$(S)/install-local.sh

release:
	@test -n "$(VERSION)" || { echo "usage: make release VERSION=0.2.0 [NOTES=\"…\"]"; exit 1; }
	@$(S)/release.sh "$(VERSION)" $(if $(NOTES),"$(NOTES)",)

uninstall:
	@$(S)/uninstall-local.sh

clean:
	@rm -rf $(APP)/dist release $(APP)/src-tauri/target/release/bundle $(APP)/playwright-report $(APP)/test-results
	@echo "✓ build output removed"
