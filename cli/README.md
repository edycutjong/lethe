# Lethe CLI (`@edycutjong/lethe-cli`)

Command-line interface for Data Protection Officers (DPOs) and power users to manage GDPR/CCPA right-to-erasure campaigns. Wraps the `@edycutjong/lethe-sdk` to provide terminal access to broker registration, batch deletion, receipt verification, and performance benchmarking.

## Commands

### `lethe register` — Register a Data Broker Template

```bash
lethe register --broker-id zoominfo-mock --template ./data/fixtures/broker-template.json
```

Registers a new broker egress template with the coordinator agent. The template JSON should contain `host`, `path`, and `template` fields.

### `lethe erase` — Trigger Deletion Campaign

```bash
lethe erase \
  --email sophie.miller@gmail.com \
  --ssn 999-88-7777 \
  --brokers zoominfo-mock,whitepages-mock,spokeo-mock
```

Executes the full erasure pipeline:
1. Generates a Groth16 ZK proof of identity ownership
2. Encrypts PII into an ECIES envelope using the enclave's public key
3. Simulates x402 micropayment challenge
4. Enqueues the campaign with the coordinator agent
5. Fires deletion webhooks for each target broker
6. Saves signed VC receipts to `./receipts/<broker-id>-proof.json`

### `lethe verify-vc` — Verify a Deletion Receipt

```bash
lethe verify-vc --receipt ./receipts/zoominfo-mock-proof.json
```

Cryptographically validates a signed Verifiable Credential receipt against the Lethe enclave signer authority. Displays broker, status, and timestamp.

### `lethe bench` — Performance Benchmarks

```bash
lethe bench --runs 100 --concurrency 5
```

Runs latency benchmarks for 4 cryptographic operations:
- `t_encrypt` — ECIES envelope encryption
- `t_zk` — ZK proof generation
- `t_decrypt` — ECIES decryption (enclave emulation)
- `t_zeroize` — Memory scrubbing

Outputs a markdown table with min, max, p50, p95, and p99 latencies.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AGENT_URL` | `http://localhost:8080` | Coordinator agent gateway URL |
| `NEXT_PUBLIC_AGENT_URL` | *(fallback)* | Alternative env var for agent URL |
| `ENCLAVE_PUB_KEY` | *(set in .env)* | secp256k1 uncompressed public key for ECIES encryption |
| `ENCLAVE_PRIVATE_KEY` | *(set in .env)* | secp256k1 private key for benchmark decryption |

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests (Jest)
npm test
```

## Dependencies

| Package | Purpose |
|---|---|
| `commander` | CLI argument parsing |
| `@edycutjong/lethe-sdk` | Core cryptographic operations |
| `fs` / `path` | File I/O for templates and receipts |
| `crypto` | Node.js built-in for benchmarking |
