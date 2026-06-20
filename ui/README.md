# Lethe Dashboard UI

Next.js 16 interactive dashboard for orchestrating and visualizing right-to-erasure campaigns. Provides a military SOC-style command center with real-time telemetry streaming, a 40-broker grid, evidence ledger, and cryptographic self-destruct sequence.

## Pages

| Route | Description |
|---|---|
| `/` | Main dashboard — onboarding flow, broker grid, live telemetry console, evidence ledger, self-destruct |
| `/integrations/verify` | Contract telemetry — staking escrow, SLA compliance, on-chain transaction history, slash simulation |

## API Routes

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/encrypt` | Server-side ECIES encryption via `@lethe/sdk` (avoids exposing crypto in client bundle) |
| `POST` | `/api/zk-proof` | Server-side Groth16 ZK proof generation via `@lethe/sdk` |

## Dashboard Flow

The main dashboard guides the user through a 5-step campaign:

1. **SIWE Onboard** — Authenticate with Ethereum wallet to bind a `did:t3n` identity
2. **Delegate Agent** — Generate ZK proof and encrypt PII credentials into an ECIES envelope
3. **Escrow & Micropayment** — Batch deposit USDC collateral and pay x402 challenge fees
4. **Trigger Campaign** — Fire blinded erasure webhooks against 40 data brokers
5. **Self-Destruct** — Zeroize TEE memory and invoke `user-removal` to permanently erase identity

## Features

- **40-Broker Grid** — Visual status tracker (Active → Sending → Deleted) with click-to-inspect VC receipts
- **Split-Screen Telemetry** — Real-time log stream showing Agent (unsecure view) vs TEE Enclave (decrypt egress)
- **Evidence Ledger** — Scrollable list of all signed Verifiable Credential deletion receipts
- **SLA Timer** — 72-hour countdown for agent compliance window
- **Slash Simulator** — Test SLA violation penalties on the `/integrations/verify` page

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_AGENT_URL` | `http://localhost:8080` | Coordinator agent gateway URL |
| `NEXT_PUBLIC_T3N_DID` | `did:t3n:sophie123` | Default user DID for sandbox demo |
| `NEXT_PUBLIC_ENCLAVE_PUB_KEY` | *(set in .env)* | secp256k1 uncompressed public key for ECIES |

## Design System

| Token | Value |
|---|---|
| **Primary** | Amber `#f59e0b` |
| **Success** | Emerald `#10b981` |
| **Danger** | Red `#ef4444` |
| **Background** | Slate `#020617` |
| **Display Font** | Orbitron (headings) |
| **Body Font** | Inter (text) |
| **Mono Font** | JetBrains Mono (data, logs) |
| **Aesthetic** | Military SOC / Command Center, dark mode, glassmorphism |

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run ESLint
npm run lint

# Run Playwright E2E tests
npx playwright test

# Run Lighthouse CI
npx lhci autorun
```

## Testing

- **E2E Tests:** Playwright suites in `e2e/` directory
- **Lighthouse CI:** Performance audit configured in `lighthouserc.json`

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **UI** | React 19 |
| **Styling** | Tailwind CSS v4 |
| **Fonts** | Google Fonts (Inter, Orbitron, JetBrains Mono) |
| **E2E** | Playwright |
| **Performance** | Lighthouse CI |
