# Security Policy

## Supported Versions

Lethe is currently in active development. We actively monitor and maintain the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of Lethe seriously, especially given its role as an autonomous data-erasure engine managing user cryptographic keys, ZK proofs, and GDPR erasures inside secure hardware-isolated enclaves.

If you discover a security vulnerability within Lethe, please do not disclose it publicly. Instead, follow these steps to report it responsibly:

1. Go to the [Security Advisories](../../security/advisories) tab on GitHub.
2. Click **Report a vulnerability**.
3. Provide a detailed description of the vulnerability, including steps to reproduce it, potential impact on the data-erasure pipeline, SIWE wallet authentication, or the zeroization self-destruct mechanism.

We will acknowledge receipt of your vulnerability report within 48 hours and strive to resolve the issue responsibly.

## Scope

The following areas are in scope for security reports:
- The Rust TEE contract (`contract/`)
- The Browser SDK cryptographic operations (`sdk/`)
- The Node.js Coordinator Agent (`agent/`)
- The Lethe Console Next.js dashboard (`ui/`)
- The CLI client utility (`cli/`)

Thank you for helping keep Lethe secure!
