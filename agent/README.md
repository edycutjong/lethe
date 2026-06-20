# Lethe Coordinator Agent

Node.js Express gateway that simulates the untrusted coordinator between client SDK and TEE enclave. Routes encrypted payloads and ZK proofs into the enclave for processing, and streams telemetry logs to the dashboard.

> **Security Model:** The coordinator agent is intentionally *blind* — it handles only ciphertext. Decryption and PII resolution happen exclusively inside the TEE contract. In this sandbox, the agent emulates TEE decryption locally for demo purposes.

## Architecture Role

```mermaid
graph LR
    SDK[Client SDK] -->|Ciphertext Only| Agent[Coordinator Agent]
    Agent -->|Enveloped Payload| TEE[TEE Contract (Intel TDX)]
    
    style SDK fill:#020617,stroke:#64748b,stroke-width:1px
    style Agent fill:#020617,stroke:#f59e0b,stroke-width:1px
    style TEE fill:#020617,stroke:#22c55e,stroke-width:2px
```

The agent serves as the JSON-RPC/REST API interface between the client (CLI, SDK, Dashboard UI) and the secure enclave contract. It:

1. Receives ECIES-encrypted envelopes and Groth16 ZK proofs from clients
2. Validates x402 micropayment receipts (simulated on-chain check)
3. Verifies ZK proof structure
4. Decrypts ECIES payloads (emulating TEE behavior in sandbox mode)
5. Dispatches egress webhooks to data broker APIs
6. Issues signed Verifiable Credential (VC) deletion receipts
7. Provides telemetry streaming for the split-screen dashboard console

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/broker/register` | Register a data broker egress template |
| `POST` | `/api/erasure/enqueue` | Enqueue a batch deletion campaign job |
| `POST` | `/api/erasure/fire` | Fire a deletion webhook for a specific broker |
| `GET` | `/api/erasure/evidence/:id` | Retrieve a signed VC deletion receipt |
| `POST` | `/api/erasure/forget` | Trigger cryptographic purge / self-destruct |
| `GET` | `/api/telemetry` | Poll live telemetry logs (agent + enclave) |
| `POST` | `/api/telemetry/clear` | Clear the telemetry buffer |
| `POST` | `/api/telemetry/log` | Post a custom telemetry log entry |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP server port |
| `DID` | `did:t3n:sophie123` | Default user DID for sandbox |
| `ENCLAVE_PRIVATE_KEY` | *(set in .env)* | secp256k1 private key for ECIES decryption |

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start production server
npm start

# Start dev server (ts-node)
npm run dev

# Run integration tests (Jest)
npm test
```

## Testing

The agent has a comprehensive Jest test suite in `src/index.test.ts` covering all 8 endpoints including error paths, rate limit simulation, and x402 payment validation.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 4.x
- **Language:** TypeScript
- **Crypto:** Node.js `crypto` module (secp256k1 ECDH, AES-256-GCM, HKDF-SHA256)
- **Testing:** Jest + ts-jest
