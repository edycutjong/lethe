# Golden Path — 2-Minute Reviewer Quickstart (Lethe)

> For judges: see the whole **right-to-erasure + enclave self-destruct** flow end-to-end with **zero credentials, no API keys, no external services**. Everything runs locally against the bundled Rust→WASM enclave contract.

## Choose your path

| Goal | Command | Time | Credentials |
|------|---------|------|-------------|
| **See it all pass** (lint, types, Rust + Jest tests, e2e) | `make bootstrap && make ci` | ~2 min | None |
| **Click through the UI** | `cd ui && npm run dev` → http://localhost:3000 | ~2 min | None |
| **Prove no PII leaks the enclave** | `make verify-offline` | ~1 min | None |
| **Read the full walkthrough** | [DEMO.md](../DEMO.md) | — | — |

## The 2-minute demo (UI)

1. **Onboard** — load the sample identity (no wallet needed in sandbox).
2. **Authorize delegation** — approve the agent to act on your behalf within scope.
3. **Fund x402 micropayments** — batch-fund the per-request payment hashes that protect broker APIs from spam.
4. **Trigger the blinded erasure loop** — the coordinator stays blind; the enclave decrypts your PII envelope and fires GDPR opt-outs to each broker via **`http-with-placeholders`** (your real email/SSN are substituted at the egress edge), returning a signed **VC** per deletion.
5. **Self-destruct** — click **Purge Identity & Self-Destruct**: the agent zeroizes keys and calls **`user-removal`** to wipe the delegation session. *The last act of the agent is to forget you.*

## What's real vs simulated
- **Real:** the Rust→WASM enclave contract, PII-blind placeholder egress, enclave-signed VC receipts, and the `user-removal` self-destruct ordering.
- **Simulated (local sandbox):** the Terminal 3 host APIs, broker endpoints (seeded test directory), and x402 settlement. See the "Hackathon Simulation Context" banner in the app.

## Bug-bounty track
See **[SDK_AUDIT.md](SDK_AUDIT.md)** — confirmed, code-cited security findings verified from the real published `@terminal3` VC packages — and **[BUGS.md](../BUGS.md)** for integration/doc gaps.
