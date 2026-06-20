.PHONY: help bootstrap gen-keys build test lint typecheck ci e2e lighthouse security-scan check-readiness verify-offline bench version-patch version-minor version-major
.PHONY: bootstrap-sdk bootstrap-contract bootstrap-agent bootstrap-cli bootstrap-ui
.PHONY: build-sdk build-contract build-agent build-cli build-ui
.PHONY: test-sdk test-contract test-agent test-cli test-ui

help:
	@echo "Lethe Build and Testing Automation Harness"
	@echo "════════════════════════════════════════════"
	@echo ""
	@echo "── Bootstrap ──────────────────────────────"
	@echo "  bootstrap          Install all dependencies across all services"
	@echo "  bootstrap-sdk      Install SDK dependencies only"
	@echo "  bootstrap-contract Fetch Rust contract dependencies"
	@echo "  bootstrap-agent    Install Agent dependencies only"
	@echo "  bootstrap-cli      Install CLI dependencies only"
	@echo "  bootstrap-ui       Install UI dependencies only"
	@echo "  gen-keys           Generate a demo enclave secp256k1 keypair for .env.local"
	@echo ""
	@echo "── Build ──────────────────────────────────"
	@echo "  build              Compile all packages (SDK → Contract → Agent → CLI → UI)"
	@echo "  build-sdk          Compile TypeScript SDK"
	@echo "  build-contract     Compile Rust TEE contract to wasm32-wasip2"
	@echo "  build-agent        Compile Coordinator Agent"
	@echo "  build-cli          Compile CLI"
	@echo "  build-ui           Build Next.js dashboard for production"
	@echo ""
	@echo "── Test ───────────────────────────────────"
	@echo "  test               Run all unit and integration tests"
	@echo "  test-sdk           Run SDK tests (Jest)"
	@echo "  test-contract      Run Rust contract unit tests (cargo test)"
	@echo "  test-agent         Run Agent integration tests (Jest, 44 cases)"
	@echo "  test-cli           Run CLI tests (Jest, 100% coverage)"
	@echo "  test-ui            Run UI unit tests (Jest)"
	@echo ""
	@echo "── Quality ────────────────────────────────"
	@echo "  lint               Run ESLint on the Next.js UI"
	@echo "  typecheck          Verify TypeScript type safety in all TS services"
	@echo "  ci                 Run full CI pipeline (lint + typecheck + test + e2e)"
	@echo ""
	@echo "── E2E & Performance ──────────────────────"
	@echo "  e2e                Execute Playwright end-to-end tests (demo mode)"
	@echo "  lighthouse         Run Lighthouse CI audit on the UI dashboard"
	@echo "  bench              Run latency benchmarks via scripts/bench.py"
	@echo ""
	@echo "── Security & Submission ──────────────────"
	@echo "  security-scan      Run vulnerability audits and license compliance"
	@echo "  check-readiness    Run the official submission readiness check"
	@echo "  verify-offline     Run the enclave PII leak offline verification"
	@echo ""
	@echo "── Versioning ─────────────────────────────"
	@echo "  version-patch      Bump patch version (x.y.z -> x.y.z+1) and commit"
	@echo "  version-minor      Bump minor version (x.y.z -> x.y+1.0) and commit"
	@echo "  version-major      Bump major version (x.y.z -> x+1.0.0) and commit"

# ── Bootstrap ────────────────────────────────────────
bootstrap:
	npm run bootstrap
	cd contract && cargo fetch

bootstrap-sdk:
	npm run bootstrap:sdk

bootstrap-contract:
	cd contract && cargo fetch

bootstrap-agent:
	npm run bootstrap:agent

bootstrap-cli:
	npm run bootstrap:cli

bootstrap-ui:
	npm run bootstrap:ui

gen-keys:
	npm run gen:keys

# ── Build ────────────────────────────────────────────
build:
	npm run build

build-sdk:
	npm run build:sdk

build-contract:
	npm run build:contract

build-agent:
	npm run build:agent

build-cli:
	npm run build:cli

build-ui:
	npm run build:ui

# ── Test ─────────────────────────────────────────────
test:
	npm run test

test-sdk:
	npm run test:sdk

test-contract:
	npm run test:contract

test-agent:
	npm run test:agent

test-cli:
	npm run test:cli

test-ui:
	npm run test:ui

# ── Quality ──────────────────────────────────────────
lint:
	npm run lint

typecheck:
	npm run typecheck

ci:
	npm run lint
	npm run typecheck
	npm run test

# ── E2E & Performance ───────────────────────────────
e2e:
	npm run e2e

lighthouse:
	npm run lighthouse

bench:
	python3 scripts/bench.py

# ── Security & Submission ────────────────────────────
security-scan:
	@echo "🔍 Running NPM Audit..."
	npm run audit
	@echo "🔍 Running License Checker..."
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

check-readiness:
	python3 scripts/check_submission_readiness.py

verify-offline:
	python3 scripts/verify_offline.py

# ── Versioning ───────────────────────────────────────
version-patch:
	PATH="/opt/homebrew/bin:$$PATH" node scripts/bump-version.js patch
	git add .
	git commit -m "chore(release): bump version to $$(PATH="/opt/homebrew/bin:$$PATH" node -p "require('./package.json').version")"

version-minor:
	PATH="/opt/homebrew/bin:$$PATH" node scripts/bump-version.js minor
	git add .
	git commit -m "chore(release): bump version to $$(PATH="/opt/homebrew/bin:$$PATH" node -p "require('./package.json').version")"

version-major:
	PATH="/opt/homebrew/bin:$$PATH" node scripts/bump-version.js major
	git add .
	git commit -m "chore(release): bump version to $$(PATH="/opt/homebrew/bin:$$PATH" node -p "require('./package.json').version")"
