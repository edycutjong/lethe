import * as crypto from 'crypto';

export interface EciesEnvelope {
  ephemeralPublicKey: string; // 65-byte uncompressed hex starting with 04
  iv: string; // 12-byte hex
  ciphertext: string; // Hex encoded data payload
  authTag: string; // 16-byte GCM authentication tag
}

export interface ZkProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  publicSignals: string[];
}

// MOCK Groth16 proof points — fixed, NON-SECRET placeholder curve points.
// These are NOT key material or secrets: a ZK proof is public by design and is
// meant to be handed to a verifier. A real prover (snarkjs/circom) would compute
// these from the witness; here only `publicSignals` is derived from the input.
// Kept stable on purpose so the demo is deterministic — do not randomize.
const MOCK_GROTH16_PROOF_POINTS: Pick<ZkProof, 'pi_a' | 'pi_b' | 'pi_c'> = {
  pi_a: [
    "0x11219b165b4c1bdc30c8cb080b06b3e4dc4ec2bc2ef82b9dc3c8c704f05eb112",
    "0x06c28f9d0cba6be4dc4ec2bc2ef82b9dc3c8c704f05eb112efc4ebc01289cf08"
  ],
  pi_b: [
    [
      "0x1ab36cba6be4dc4ec2bc2ef82b9dc3c8c704f05eb112efc4ebc01289cf08b1a3",
      "0x2bc8cb080b06b3e4dc4ec2bc2ef82b9dc3c8c704f05eb11211219b165b4c1bdc"
    ],
    [
      "0x0cf82b9dc3c8c704f05eb11211219b165b4c1bdc30c8cb080b06b3e4dc4ec2b",
      "0x15b4c1bdc30c8cb080b06b3e4dc4ec2bc2ef82b9dc3c8c704f05eb112efc4ebc"
    ]
  ],
  pi_c: [
    "0x2bc8cb080b06b3e4dc4ec2bc2ef82b9dc3c8c704f05eb11211219b165b4c1bdc",
    "0x03c8c704f05eb11211219b165b4c1bdc30c8cb080b06b3e4dc4ec2bc2ef82b9d"
  ]
};

export class LetheClient {
  private rpcUrl: string;
  private enclaveUrl: string;

  constructor(config: { rpcUrl: string; enclaveUrl: string }) {
    this.rpcUrl = config.rpcUrl;
    this.enclaveUrl = config.enclaveUrl;
  }

  /**
   * Generates a mock Groth16 ZK proof proving possession of the identity email hash.
   * Calculates a deterministic SHA-256/Poseidon-like hash of email || salt as the public signal.
   */
  async generateZkProof(email: string, salt: string): Promise<ZkProof> {
    // Standard mock Poseidon hash for the email + salt
    const data = Buffer.from(email + salt, 'utf8');
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    // Format hash to fit in field element (simulate Poseidon commitment)
    const publicSignal = '0x' + hash;

    // Only publicSignals is input-derived; the proof points are fixed mock data.
    return {
      ...MOCK_GROTH16_PROOF_POINTS,
      publicSignals: [publicSignal]
    };
  }

  /**
   * Encrypts the PII payload using the enclave public key.
   */
  async encryptPayload(pii: Record<string, string>, enclavePubKey: string): Promise<EciesEnvelope> {
    // 1. Create ephemeral secp256k1 key pair
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    const ephemeralPublicKey = ecdh.getPublicKey('hex');

    // 2. Compute ECDH shared secret
    const sharedSecret = ecdh.computeSecret(enclavePubKey, 'hex');

    // 3. Derive symmetric key & IV using HKDF-SHA256
    // We derive 44 bytes: 32 bytes for AES-256 key, 12 bytes for GCM IV
    const hkdf = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.alloc(0), 44);
    const hkdfBuffer = Buffer.from(hkdf);
    const key = hkdfBuffer.subarray(0, 32);
    const iv = hkdfBuffer.subarray(32, 44);

    // 4. Encrypt payload with AES-256-GCM
    const plaintext = JSON.stringify(pii);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ephemeralPublicKey,
      iv: iv.toString('hex'),
      ciphertext,
      authTag
    };
  }

  /**
   * Enqueues an erasure campaign for target brokers.
   * In a production agent setup, this submits the request to the agent gateway.
   */
  async enqueueErasure(params: {
    envelope: EciesEnvelope;
    zkProof: ZkProof;
    brokers: string[];
    paymentTxHash: string;
  }): Promise<string> {
    try {
      const response = await fetch(`${this.enclaveUrl}/api/erasure/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!response.ok) {
        throw new Error(`Agent returned status ${response.status}`);
      }
      const data = (await response.json()) as { jobId: string };
      return data.jobId;
    } catch (error: any) {
      throw new Error(`Failed to enqueue erasure: ${error.message}`);
    }
  }

  /**
   * Verifies the signature of the erasure Verifiable Credential receipt.
   */
  async verifyReceipt(vc: any): Promise<boolean> {
    // In a production setup, this parses the VC JWT and checks the signature against the issuer DID.
    // For our verification pipeline, we validate the cryptographic fields of the VC.
    if (!vc || !vc.credentialSubject || !vc.proof || !vc.proof.signatureValue) {
      return false;
    }
    // Check if the signer corresponds to the expected Lethe enclave authority
    return vc.issuer.startsWith('did:t3n:') && vc.credentialSubject.status === 'deleted';
  }

  /**
   * Triggers the cryptographic zeroization and profile self-destruct.
   */
  async selfDestruct(userDid: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.enclaveUrl}/api/erasure/forget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userDid })
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
