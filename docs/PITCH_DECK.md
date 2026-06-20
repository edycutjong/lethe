# Lethe Pitch Deck — Taking Back the Digital Shadow

*Theme: Cyberpunk Slate, Neon Amber, Emerald Green*
*Fonts: Orbitron (Headings), JetBrains Mono (Data/Code)*

---

## Slide 1: The Title Slide
### LETHE — Autonomous Right-To-Erasure Agent
**Subtitle:** Cryptographically Blinded CCPA & GDPR Deletion Campaigns inside Secure Hardware Enclaves
**Visual:** A dark background with slate grids, neon green accent light, and the text "LETHE" in Orbitron font.
**Speaker Notes:**
> Hello everyone. Today, we are presenting Lethe—the first autonomous right-to-erasure agent designed to permanently prune your digital footprint from the data broker ecosystem without leaking a single byte of sensitive data along the way.

---

## Slide 2: The Problem
### The Leaky Data Broker Saga
* Sophie Miller's personal data is traded among hundreds of obscure data brokers.
* Opt-out requests require submitting *more* PII: SSNs, driver licenses, and full names.
* Result: Opt-out portals act as honey pots, leaking plain-text credentials during transit.
**Visual:** Contrast diagram showing a silhouette of Sophie Miller with dozens of connections to red broker nodes.
**Speaker Notes:**
> Meet Sophie Miller. Like millions of others, her details are sold daily. When she tries to delete her records, she faces a paradox: she has to submit her email, phone number, and SSN to unverified web portals. If a portal gets breached, she is in a worse position than before. Opt-out portals have become data honeypots.

---

## Slide 3: The Security Gap
### Plaintext Egress Leakage
* Standard scraper bots handle user credentials in volatile server RAM.
* Host operators, database admins, and network logs inspect plaintext PII.
* Scraper proxies are highly vulnerable to server-side attacks.
**Visual:** Red warning box showing a server memory dump exposing plain text email and SSN.
**Speaker Notes:**
> Scraping agents that automate deletion requests must read your data in plaintext to send it to brokers. This means developers, host providers, and database logs can see your raw SSN and email. There is no cryptographic seal between your credentials and the agent coordinator.

---

## Slide 4: The Solution
### Lethe — The Blind Deletion Agent
* **Secure Enclave Isolation:** Core decryption and request formatting run inside a secure TEE (Trusted Execution Environment).
* **ECIES Blinding:** PII is encrypted on the client browser and decrypted only in TEE volatile RAM.
* **Zero Plaintext Logs:** Zero unsecure log traces of user data.
**Visual:** Emerald green padlock symbol surrounding a clean flow diagram (Browser SDK → TEE Enclave → Broker).
**Speaker Notes:**
> Lethe resolves this by blinding the deletion agent. Using ECIES, the browser encrypts Sophie's PII. The coordinator agent routes the request but cannot read it. Decryption occurs strictly inside a secure TEE enclave, formatting the CCPA request and firing it directly to the broker. No logs, no host exposure, no trace.

---

## Slide 5: Core Architecture
### Terminal 3 ADK Implementation
* **Browser SDK:** Client-side ECIES encryption and Groth16 ZK proof generation.
* **TEE Rust WASM Contract:** Groth16 validation, ECIES decryption, VC signing.
* **HTTP Placeholder Proxy:** Secure proxy egress resolving variables inside the TLS tunnel.
**Visual:** Flowchart detailing the SDK, Express Agent Gateway, Rust Contract inside TEE, and Edge HTTP Proxy.
**Speaker Notes:**
> The architecture relies on Terminal 3's ADK. The Browser SDK encrypts PII and generates a Groth16 ownership proof. The TEE contract (written in Rust and compiled to wasm32-wasip2) verifies the proof, decrypts the ECIES envelope, and prepares the egress request. Finally, T3's http-with-placeholders API maps variables inside the TLS tunnel to brokers, keeping the gateway blind.

---

## Slide 6: Cryptographic Moat
### Groth16 ZK Proofs + ECIES Blinding
* **Zero-Knowledge Proofs:** Prove ownership of the email hash commitment without disclosing the email.
* **ECIES Envelope:** secp256k1 ECDH key exchange + HKDF-SHA256 + AES-256-GCM.
* **Seppuku Purge:** Volatile RAM zeroization and DID de-authorization on self-destruct.
**Visual:** Matrix of encryption steps (ECDH exchange, HKDF expansion, GCM tag check).
**Speaker Notes:**
> To prevent spam and spoofing, Lethe requires a Groth16 ZK proof. You prove you own the target email without revealing it to the network. The contract verifies this offline before firing. Once the campaign is done, a final seppuku purge scrubs volatile RAM key states and de-authorizes the session DID using T3's user-removal API.

---

## Slide 7: Economic Escrow Registry
### SLA Guarantees & x402 Micropayments
* **Escrow Staking:** Broker coordinates stake collateral to ensure uptime and SLA execution.
* **Slashing:** Failed campaigns trigger automatic slash payouts to users.
* **x402 Micropayments:** Every deletion transaction verifies on-chain challenge registry.
**Visual:** Solidity contract stub layout highlighting staking, slashing timers, and payment payouts.
**Speaker Notes:**
> Deletion must be reliable. Lethe integrates on-chain escrow. Brokers stake collateral, and if they fail to process deletion within the SLA timeline, they are slashed, compensating the user. This is fueled by x402 micropayments where each campaign is authorized by an on-chain transaction receipt verified by the enclave.

---

## Slide 8: The Lethe Console Dashboard
### Real-time Telemetry & Deletion Grid
* **Split-Screen Telemetry:** Contrasts redacted gateway view vs secure enclave logs.
* **40-Broker Grid:** Live progress tracker mapping broker deletion states.
* **Evidence Ledger:** Access signed Verifiable Credentials proving erasure compliance.
**Visual:** Mockup of Next.js dashboard featuring a cyberpunk dark terminal grid and neon colors.
**Speaker Notes:**
> Users track their campaigns via the Lethe Console Dashboard. They see a real-time 40-broker grid updating states from Active to Deleted. A split-screen telemetry console shows the blind agent logs versus TEE enclave logs, giving users absolute confidence in their privacy. The Evidence Ledger collects signed Verifiable Credentials for legal audit.

---

## Slide 9: SLA Latency Benchmarks
### Sub-Millisecond SLA Execution
* **Symmetric Encryption ($t_{\text{encrypt}}$):** ~0.69 ms (Median)
* **ZK Proof Generation ($t_{\text{zk}}$):** ~0.01 ms (Median)
* **TEE Enclave Decryption ($t_{\text{decrypt}}$):** ~0.69 ms (Median)
* **Scrubbing & Zeroization ($t_{\text{zeroize}}$):** ~0.00 ms (Median)
**Visual:** Markdown-style table displaying p50, p95, and p99 performance latency specs.
**Speaker Notes:**
> Our benchmark suites demonstrate that Lethe is blisteringly fast. Client-side ECIES encryption and TEE enclave decryption both average under 0.7 milliseconds. Memory zeroization takes less than 10 microseconds. Privacy does not come at the cost of performance.

---

## Slide 10: The Moat: Why Terminal 3?
### Unlocking Uncompromising Privacy
* Built-in hardware key isolation prevents host VM tampering.
* `http-with-placeholders` ensures raw PII is only expanded inside the secure outbound TLS tunnel.
* `user-removal` provides physical de-authorization of session DID tokens.
**Visual:** Venn diagram showing security, privacy, and speed overlapping inside Terminal 3.
**Speaker Notes:**
> Why Terminal 3? Because standard TEEs do not solve the egress problem. If an enclave decrypts PII and passes it to an unsecure proxy, security fails. Terminal 3's unique host APIs—like HTTP placeholders and user-removal—ensure that data is only exposed to the destination server in a secured HTTPS tunnel.

---

## Slide 11: Call to Action
### Prune Your Shadow Today
* Open-Source Client SDK and CLI tool.
* Active Next.js Console and Google Cloud Run Gateway.
* **Join the Purge:** Take back ownership of your digital shadow.
**Visual:** Centered Lethe logo with link to GitHub repository and project docs.
**Speaker Notes:**
> Lethe is fully open-source, featuring a developer CLI, client SDK, Next.js frontend, and Express gateway. We invite you to join the purge and take back control of your digital shadow. Thank you.
