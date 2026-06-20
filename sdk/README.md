# Lethe SDK (`@edycutjong/lethe-sdk`)

TypeScript client SDK for interacting with the Lethe erasure agent. Handles all client-side cryptographic operations: ECIES envelope encryption, ZK proof generation, campaign enqueuing, VC receipt verification, and self-destruct triggering.

> **Security Model:** PII is encrypted locally in the client's environment using the enclave's public key before any network transmission. The coordinator agent only handles ciphertext.

## Exports

### `LetheClient` Class

```typescript
import { LetheClient } from '@edycutjong/lethe-sdk';

const client = new LetheClient({
  rpcUrl: 'https://rpc.bot-chain.sandbox.test',
  enclaveUrl: 'http://localhost:8080'
});
```

#### Methods

| Method | Description |
|---|---|
| `encryptPayload(pii, enclavePubKey)` | Encrypts a PII object using ECIES (secp256k1 ECDH + HKDF-SHA256 + AES-256-GCM). Returns an `EciesEnvelope`. |
| `generateZkProof(email, salt)` | Generates a mock Groth16 ZK proof with SHA-256 public signal commitment. |
| `enqueueErasure(params)` | Submits an erasure campaign to the coordinator agent gateway. |
| `verifyReceipt(vc)` | Validates a W3C Verifiable Credential deletion receipt structure. |
| `selfDestruct(userDid)` | Triggers the TEE cryptographic purge and profile self-destruct. |

### Interfaces

| Interface | Description |
|---|---|
| `EciesEnvelope` | `{ ephemeralPublicKey, iv, ciphertext, authTag }` — ECIES encrypted payload |
| `ZkProof` | `{ pi_a, pi_b, pi_c, publicSignals }` — Groth16 proof structure |

## Cryptographic Details

The `encryptPayload` method implements real ECIES encryption:

1. **Ephemeral keypair** — `crypto.createECDH('secp256k1')` generates a fresh keypair per encryption
2. **ECDH shared secret** — Diffie-Hellman against the enclave's public key
3. **HKDF-SHA256** — Derives 44 bytes: 32-byte AES key + 12-byte GCM IV
4. **AES-256-GCM** — Encrypts JSON-serialized PII with authenticated encryption

The `generateZkProof` method currently produces a **simulated** Groth16 proof with hardcoded curve points. The `publicSignals[0]` field contains a real SHA-256 hash of `email + salt`.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run unit tests (Jest)
npm test
```

## Testing

The SDK has 9 test cases in `src/index.test.ts` covering:

- Constructor initialization
- ZK proof structure validation
- ECIES encryption output format (65-byte uncompressed pubkey, hex fields)
- VC receipt verification (valid + 5 invalid shapes)
- Enqueue success/failure/network-error paths
- Self-destruct success/failure/network-error paths
