# Terminal 3 ADK — Onboarding Bug & Documentation Audit

> Submitted for the **Terminal 3 ADK Dev Challenge 2026 — Track 2 (Bug Bounty)**.
>
> Concrete onboarding blockers and documentation gaps found while building **Lethe**
> (and the wider Vouch Suite: Epoch, Lethe, Silo, Synod, Visor) against the T3 ADK host
> APIs and SDK. Each entry lists where it bit us in Lethe and the workaround we shipped.

> 🔬 **See [SDK_AUDIT.md](docs/SDK_AUDIT.md)** for **confirmed, code-cited security findings** verified directly from the *real published* `@terminal3` VC packages via `npm pack` (hardcoded BBS `nonce` → proof replay, revocation bypass, no holder/challenge binding). The list below is integration/documentation gaps; the audit is reproducible SDK bugs.

| # | Area | Type | Severity |
|---|---|---|---|
| 1 | `metamask_sign` | Undocumented param | Low |
| 2 | `kv-store` | Interface discrepancy | High |
| 3 | `clock` | Method name mismatch | High |
| 4 | `signing` | Missing WIT helper | Medium |
| 5 | `loadWasmComponent` | Opaque path resolution | Medium |
| 6 | tenant DID | Hex double-encoding trap | High |
| 7 | public KV route | Missing spec (CORS/cache/pagination) | Low |
| 8 | transactions | Rollback semantics undocumented | Medium |
| 9 | `outbox` | Idempotency lifecycle undocumented | Medium |
| 10 | `user-removal` | Self-destruct ordering vs in-flight egress undocumented | Medium |

---

## Bug #1 — Undocumented second parameter in `metamask_sign`
**Type:** Documentation · **Severity:** Low

The SDK snippet `EthSign: metamask_sign(address, undefined, T3N_API_KEY)` never documents what the second positional argument (passed as `undefined`) configures, blocking custom wallet bindings. **Ask:** document its type/values or replace with a named options object.

## Bug #2 — `kv-store` interface discrepancy (map-name vs. flat keys)
**Type:** Interface · **Severity:** High

The WIT declares `get(map-name, key)` but the C ABI and local runtime are flat `(key_ptr, key_len)`. **Where it bit us:** Lethe maintains a broker directory and `scan`s active deletion campaigns through the flat shape; a WIT-component port needs a wrapper. **Ask:** make the WIT and C ABI agree.

## Bug #3 — Clock API method-name mismatch
**Type:** Interface · **Severity:** High

Docs say `host_clock_now() -> u64`; the WIT requires `now-ms() -> result<u64, clock-error>`, breaking `wasm32-wasip2` builds. **Ask:** align the documented import with the WIT and state the target triple per example.

## Bug #4 — Missing `host_signing_issue_vc` in the `signing` WIT
**Type:** Interface · **Severity:** Medium

Templates call `host_signing_issue_vc`, but the WIT only exposes raw `sign`. **Where it bit us:** Lethe issues a deletion-proof VC per broker and had to hand-build the W3C envelope over `sign`. **Ask:** add a VC helper or document the canonical recipe.

## Gap #5 — Opaque `loadWasmComponent()` path resolution
**Type:** Documentation · **Severity:** Medium

`loadWasmComponent()` is called with no args and no documented resolution base or override. **Where it bit us:** we resolve the `.wasm` path explicitly to avoid the ambiguity. **Ask:** document the base path and an override.

## Gap #6 — Tenant DID hex double-encoding trap
**Type:** Correctness · **Severity:** High

`format!("z:{}:secrets", hex::encode(&tid))` double-encodes when `tenant_did()` returns a string, silently breaking KV routing. **Ask:** clarify whether `tenant_did()` returns bytes or a string and show the correct derivation.

## Gap #7 — Public KV route specification
**Type:** Documentation · **Severity:** Low

`/api/dev/public-kv/<tid>/<tail>` is mentioned with no CORS, cache, or pagination spec. **Ask:** publish them.

## Gap #8 — Transaction rollback semantics undocumented
**Type:** Documentation · **Severity:** Medium

It is unspecified what an `Err` return rolls back (KV writes? `kv delete`? outbox enqueues?). **Where it bit us:** Lethe's erasure campaign must not leave a half-deleted broker directory if a step fails; we enforce ordering in guest code rather than trusting host rollback. **Ask:** document the rollback boundary.

## Gap #9 — `outbox` idempotency lifecycle undocumented
**Type:** Documentation · **Severity:** Medium

The dedup **window lifespan** and **overflow** behavior of the `idk` idempotency key are undocumented. **Where it bit us:** Lethe registers deletion-evidence events on the outbox and the correct key strategy depends on the (unspecified) dedup window. **Ask:** document the window/TTL and overflow behavior.

## Gap #10 — `user-removal` ordering vs. in-flight egress undocumented
**Type:** Correctness · **Severity:** Medium

`remove_user` destroys the tenant's credentials/contacts, but the docs don't say what happens to **in-flight** `http-with-placeholders` requests that still reference `{{profile.*}}` markers at the moment of removal. **Where it bit us:** Lethe's self-destruct must run strictly *after* the last broker erasure resolves its placeholders, or those requests would lose their substitutions. We serialize removal last; the host contract is silent on whether it would otherwise race. **Ask:** document removal ordering guarantees relative to pending egress.
