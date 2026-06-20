# Lethe Developer Experience (DX) Friction Log

This document records the engineering friction points, hurdles, and architectural decisions made during the integration of the **Terminal 3 Agent Developer Kit (ADK)** with the Lethe Coordinator Agent and Rust TEE contract.

---

## 1. Cryptographic Key Format Alignment (secp256k1 SEC1)

### The Hurdle
When implementing ECIES (Elliptic Curve Integrated Encryption Scheme) between the client-side TypeScript SDK (`crypto` module) and the Rust WASM contract (`k256` crate), we encountered key format mismatch errors. Node's `crypto.createECDH` generates public keys in uncompressed format (65 bytes starting with `04` hex) by default, while `k256` expects specific SEC1 compressed or uncompressed encodings. 
- Passing raw public keys directly caused Rust's SEC1 parser to reject them with `InvalidPoint` or `InvalidLength` errors.

### The Mitigation
We standardized the SDK to output uncompressed 65-byte public keys starting with `04` hex:
```typescript
const ephemeralPublicKey = ecdh.getPublicKey('hex'); // 130 characters hex
```
On the Rust contract side, we imported `k256::PublicKey` and used SEC1 deserialization from SEC1-encoded bytes:
```rust
let pk = k256::PublicKey::from_sec1_bytes(&ephemeral_pk_bytes)
    .map_err(|e| format!("Invalid ephemeral public key format: {e}"))?;
```
This ensured 100% cryptographic compatibility between Node.js client-side ECIES and Rust enclave decryption.

---

## 2. ArrayBuffer and TypedArray Casting in Node.js

### The Hurdle
Node's synchronous HKDF function `crypto.hkdfSync` returns a raw `ArrayBuffer`. When attempting to extract subarrays for the AES key and GCM IV using `.subarray()`, TypeScript compilation failed because `ArrayBuffer` does not implement the `TypedArray` interface. Additionally, passing raw `ArrayBuffer` segments into `crypto.createCipheriv` threw runtime type errors.

### The Mitigation
We explicitly wrapped the HKDF output in a Node `Buffer` wrapper before slicing the key material:
```typescript
const hkdf = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.alloc(0), 44);
const hkdfBuffer = Buffer.from(hkdf);
const key = hkdfBuffer.subarray(0, 32);
const iv = hkdfBuffer.subarray(32, 44);
```
This ensured safe type casting and compatibility with downstream AES-GCM cipher streams in both the SDK and agent test suites.

---

## 3. Terminal 3 TEE WIT Logging Interface Limits

### The Hurdle
The WIT interface defined by the host TEE platform exports the `host:interfaces/logging` package. While trying to compile the Rust WASM Component contract, we attempted to call `logging::warn()`. This caused compilation to fail because the WASI bindings exported by Terminal 3's runtime only support `info`, `error`, and `debug`, omitting the `warn` method despite it being present in standard WASI logging specs.

### The Mitigation
We replaced all warnings with `info` or `error` logging depending on severity:
```rust
// Replaced logging::warn with logging::error
host::interfaces::logging::error("INITIATING CRYPTOGRAPHIC PURGE / SELF-DESTRUCT IN TEE...")?;
```
This maintained the logging runtime compatibility without breaking compiler targets.

---

## 4. WASM WASIP2 Target Scaffolding

### The Hurdle
Targeting `wasm32-wasip2` was complex because standard cargo tests run on the host target (e.g. `x86_64-apple-darwin` or `aarch64-apple-darwin`), while the component runs under WASM WASI. Creating tests that can run on the host target required isolating imports of the `exports` and `host` WIT bindings, which are stubbed or generated only under `wasm32` compilation.

### The Mitigation
We wrapped the Guest contract implementation and exports behind a `#[cfg(target_arch = "wasm32")]` block:
```rust
#[cfg(target_arch = "wasm32")]
impl exports::lethe::agent::contracts::Guest for Component { ... }

#[cfg(target_arch = "wasm32")]
export!(Component);
```
This enabled us to write native cargo unit tests in `contract/src/lib.rs` targeting private cryptographic functions like `decrypt_ecies_payload` without compile-time errors about missing WIT imports on host architectures.

---

## 5. Preventing Plaintext PII Leakage in Sandbox Modes

### The Hurdle
During development in sandbox mode (emulating TEE locally), the Coordinator Agent printed full Express request and response bodies. This created a security risk of leaking plaintext PII (like Sophie Miller's SSN or email) into standard output console logs.

### The Mitigation
We implemented a split telemetry logger in `agent/src/index.ts` that explicitly redacts sensitive data. The unsecure `[AGENT]` logs only show redacted/encrypted ECIES envelopes, while the `[ENCLAVE]` logs censor the values:
```typescript
logTelemetry('enclave', `Decrypted PII payload inside TEE memory: [Protected]`);
```
Additionally, our `verify_offline.py` pipeline verifies that no plain text of the email or SSN ever appears in unsecure logs.
