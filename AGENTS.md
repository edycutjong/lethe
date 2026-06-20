# Lethe Setup — Agent Configuration

This document specifies the software architecture, package structures, and components for **Lethe**, the autonomous data-erasure agent.

## Project Structure

```text
/Users/edycu/Projects/Hackathon/HermesDocs/projects/dorahacks-t3adk-launch-2026/projects/lethe/
├── PROGRESS.md
├── DECISIONS.md
├── README.md
├── AGENTS.md
├── .env.example
├── sdk/                # TypeScript SDK (@edycutjong/lethe-sdk)
├── contract/           # Rust WASM Component Contract
├── agent/              # Node.js Coordinator Agent
├── ui/                 # Next.js Dashboard App
├── cli/                # @edycutjong/lethe-cli executable
└── scripts/            # Benchmarking, seeding, and verification scripts
```

## Setup Components

### 1. Browser SDK (`/sdk`)
*   **Role:** Local cryptographic operations and proof generation.
*   **Technological Stack:** TypeScript, `secp256k1` (ECDH), `aes-256-gcm` encryption.
*   **APIs Exposed:** `encryptPayload`, `generateZkProof`, `enqueueErasure`, `selfDestruct`.

### 2. Rust TEE Contract (`/contract`)
*   **Role:** Decrypts payloads inside hardware-isolated enclaves, verifies ZK proofs offline, executes template placeholdered requests, registers evidence, and executes zeroization self-destruct.
*   **Technological Stack:** Rust `wasm32-wasip2` WASM Component, `wit-bindgen`, `serde_json`, `hex`, `secp256k1`, `aes-gcm`.
*   **WIT Exports:** `register-broker`, `enqueue-erasure`, `fire-erasure`, `get-evidence`, `forget-me`.

### 3. Node.js Coordinator Agent (`/agent`)
*   **Role:** Orchestrates client-enclave requests, handles Wallet Authentication SIWE challenge and handshake, runs routing, verifies x402 on-chain challenges.
*   **Technological Stack:** Node.js, TypeScript, Express, `@terminal3/t3n-sdk`, `ethers.js`.

### 4. Lethe Console Dashboard (`/ui`)
*   **Role:** Web interface for managing erasure campaigns, visualizing the broker grid, displaying agent/enclave telemetry consoles, verifying VCs, and initiating the final self-destruct.
*   **Technological Stack:** Next.js 16, React 19, Tailwind CSS v4, Orbitron & JetBrains Mono typography.

### 5. CLI Client (`/cli`)
*   **Role:** Developer and DPO command-line utility for register, erase, verify-vc, and bench commands.
*   **Technological Stack:** Node.js, Commander.js.
