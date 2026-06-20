# Lethe TEE Contract

Rust WebAssembly Component contract that runs inside the Intel TDX Trusted Execution Environment (TEE). Handles all sensitive operations: ECIES decryption, ZK proof verification, broker webhook dispatch via placeholder blinding, VC signing, and cryptographic self-destruct.

> **Security Model:** All plaintext PII is confined to TEE enclave memory. The contract uses `http-with-placeholders` for egress so that the coordinator agent (untrusted host) never sees decrypted data.

## Architecture Role

```mermaid
graph LR
    Agent[Coordinator Agent] --> TEE[TEE Contract (this)]
    TEE --> Brokers[Data Broker APIs]
    TEE <--> Host[T3 Host APIs<br>(KV, Signing, HTTP, etc.)]
    
    style Agent fill:#020617,stroke:#f59e0b,stroke-width:1px
    style TEE fill:#020617,stroke:#22c55e,stroke-width:2px
    style Brokers fill:#020617,stroke:#64748b,stroke-width:1px
    style Host fill:#020617,stroke:#06b6d4,stroke-width:1px
```

## WASM Component Exports

The contract exports 5 functions via the WIT `contracts` interface:

| Function | Description |
|---|---|
| `register-broker` | Stores a broker template (host, path, egress template) in the `lethe:broker` KV namespace |
| `enqueue-erasure` | Creates a pending deletion job in `lethe:job` KV with authenticated user DID |
| `fire-erasure` | Full pipeline: verify x402 payment → verify Groth16 ZK proof → decrypt ECIES envelope → fetch broker template → dispatch blind egress webhook → sign VC receipt → store evidence |
| `get-evidence` | Retrieves a signed VC deletion receipt from `lethe:evidence` KV |
| `forget-me` | Scans and deletes all KV entries, zeroizes private keys in volatile RAM, calls `user-removal` to wipe the user profile |

## T3 ADK Host API Dependencies

The contract imports 9 host interfaces:

| Host API | Usage |
|---|---|
| `kv-store` | Namespace-isolated storage (`lethe:broker`, `lethe:job`, `lethe:evidence`) |
| `http-with-placeholders` | Blind egress webhooks — placeholders resolved at network edge |
| `signing` | ECDSA signing for Verifiable Credential receipts |
| `user-removal` | Destroys user profile DID on self-destruct |
| `user-profile` | Retrieves encrypted user profile data |
| `authorisation` | Verifies delegation scopes |
| `logging` | Structured enclave logging |
| `clock` | Monotonic timestamps for receipt IDs |
| `outbox` | Durable retry queue for audit ledger dispatch |

Additionally, two custom interfaces are defined:

| Interface | Function | Description |
|---|---|---|
| `chain-rpc` | `query-payment(tx-hash) → bool` | Verifies x402 on-chain payment |
| `zk-verify` | `verify-proof(proof, signals) → bool` | Validates Groth16 ZK proof |

## Cryptographic Implementation

The ECIES decryption pipeline is a real implementation (not mocked):

1. **ECDH key agreement** — `k256::ecdh::diffie_hellman` with secp256k1
2. **HKDF-SHA256 key derivation** — 44 bytes (32 AES key + 12 IV)
3. **AES-256-GCM decryption** — `aes-gcm` crate with authentication tag verification

Unit tests in `src/lib.rs` verify end-to-end encrypt/decrypt roundtrips.

## Solidity Companion

[`LetheStakingRegistry.sol`](LetheStakingRegistry.sol) defines the on-chain economic layer:

- `$500 USDC` agent collateral staking
- `$0.05 USDC` per-broker x402 challenge fee
- `72-hour` SLA window with slashing on violation
- `$50 USDC` compensation to user on SLA breach

## Build

```bash
# Prerequisite: install WASM target
rustup target add wasm32-wasip2

# Compile to WASM Component
cargo build --target wasm32-wasip2

# Release build (optimized)
cargo build --target wasm32-wasip2 --release

# Run unit tests (native target)
cargo test
```

## Dependencies

| Crate | Purpose |
|---|---|
| `wit-bindgen` | WASM Component Model bindings |
| `serde` / `serde_json` | JSON serialization (no_std compatible) |
| `k256` | secp256k1 elliptic curve (ECDH) |
| `aes-gcm` | AES-256-GCM authenticated encryption |
| `hkdf` | HKDF key derivation |
| `sha2` | SHA-256 hashing |
| `hex` | Hex encoding/decoding |
