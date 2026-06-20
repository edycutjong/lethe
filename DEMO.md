# Lethe — Demo Protocol

This guide walks through the step-by-step demo protocol for judges to reproduce and verify **Lethe** functionality.

---

## 1. Setup & Environment
- **Prerequisites:** Node.js ≥ 20.9.0, Rust, and the Terminal 3 Local Sandbox CLI installed.
- **Run Seeding:**
  ```bash
  python3 scripts/seed.py
  ```
  *This registers the mock data broker templates, seeds the user profile context for `did:t3n:sophie123`, and deploys the mock x402 ledger and staking contracts.*

---

## 2. Step-by-Step Walkthrough

### Step 1: Initialize Erasure Campaign
1. Open the UI at `http://localhost:3000`.
2. View the dashboard listing 40 active data brokers showing data found for Sophie Miller.
3. Click **Authorize Agent** to grant delegation scopes for `fire-erasure` and `forget-me` on broker targets.
4. Watch the client log show `@lethe/sdk` generating a Poseidon hash of Sophie's email/SSN and compiling the Groth16 ZK ownership proof.
5. Watch the client encrypt the PII payload into an ECIES Envelope using the enclave's public key.

### Step 2: Pay x402 Challenge & Lock Collateral
1. Click **Fund Campaign & Lock Escrow**.
2. A single MetaMask Smart Account prompt appears (batching approvals and escrow funding via ERC-7715).
3. Confirm the batch:
   - Locks the agent SLA staking bond ($500.00 USDC collateral).
   - Pays the flat x402 challenge fee ($2.00 USDC for the 40 broker target batch).
4. View the transaction hash and payment confirmation on the UI.

### Step 3: Trigger Deletion Campaign & TEE Egress
1. Click the main button: **"Erase Me Everywhere"**.
2. Watch the progress bar count up as brokers shift from `Active` to `Deleted (Receipt Signed)`.
3. Check the live split-screen console:
   - **Left Panel (Agent Context):** Shows the outgoing POST payloads containing `{{profile.verified_contacts.email.value}}` and `{{profile.ssn}}` along with the ECIES envelope and ZK proof structure. Note that the unsecure agent context has 0 plaintext values.
   - **Right Panel (Broker Egress):** Shows the TEE enclaves decrypting the envelope, verifying the ZK proof, checking the x402 transaction receipt on-chain, and injecting the real email (`sophie@broker-bypass.com`) and SSN (`999-88-7777`) only at the network egress edge to authenticate deletions.

### Step 4: Verify Deletion Proofs & SLA Status
1. Select a deleted broker (e.g., ZoomInfo).
2. Click **Verify Deletion** to run the in-contract VC validator against the signature DID registry.
3. Observe the green verification badge confirming that the cryptographic receipt is valid.
4. Navigate to `/integrations/verify` to view the live dashboard streaming transaction hashes and SLA compliance metrics.

### Step 5: Programmatic CLI & SDK Verification (DPO Flow)
1. Run the CLI tool to verify a deletion proof programmatically:
   ```bash
   lethe verify-vc --receipt ./receipts/zoominfo-proof.json
   ```
2. Test the benchmark suite measuring enclave latency:
   ```bash
   lethe bench --runs 50 --concurrency 5
   ```
   *This outputs a table with p50, p90, p95, and p99 metrics for encryption, ZK proof verification, and TEE key scrubbing.*

### Step 6: The Self-Destruct Finale (Suicide Sequence)
1. Click the large warning-bordered button: **"Forget Me / Self-Destruct"**.
2. Confirm the action in the prompt.
3. Watch the dashboard:
   - The TEE console logs display: `Invoking host/user-removal on tenant-launch-lethe...`
   - Memory regions containing session keys and private key exponents are scrubbed (zeroized).
   - The UI components visually fade and dissolve.
   - The page is redirected to a 404 showing: "Identity and agent state permanently erased."
4. Attempting to reload or execute any contract function returns `401 Unauthorized` (the identity DID has been completely wiped).
