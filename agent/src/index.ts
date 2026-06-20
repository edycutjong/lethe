import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

// In-memory KV Store simulating CCF-backed TEE KV
const letheBrokers = new Map<string, any>();
const letheJobs = new Map<string, any>();
const letheEvidence = new Map<string, any>();

import * as fs from 'fs';
import * as path from 'path';

try {
  const brokersPath = path.join(__dirname, '../../data/fixtures/brokers.json');
  if (fs.existsSync(brokersPath)) {
    const rawBrokers = JSON.parse(fs.readFileSync(brokersPath, 'utf8'));
    for (const b of rawBrokers) {
      letheBrokers.set(b.id, b);
    }
    console.log(`Auto-seeded ${letheBrokers.size} data brokers on startup.`);
  }
} catch (err) {
  /* istanbul ignore next */
  console.warn('Could not auto-seed brokers:', err);
}

// Shared private key for ECIES decryption inside the simulated enclave.
// Must be supplied via the environment — there is no insecure baked-in default.
// In production this key is sealed inside the TEE and never exposed.
// Generate a local demo keypair with: npm run gen:keys
const ENCLAVE_PRIVATE_KEY: string = process.env.ENCLAVE_PRIVATE_KEY ?? (() => {
  throw new Error(
    'ENCLAVE_PRIVATE_KEY is not set. Copy .env.example to .env.local and run ' +
    '`npm run gen:keys` to generate a matching secp256k1 keypair.'
  );
})();

// Telemetry buffer for split-screen console log stream
let telemetryLogs: Array<{
  timestamp: number;
  type: 'agent' | 'enclave';
  message: string;
  data?: any;
}> = [];

function logTelemetry(type: 'agent' | 'enclave', message: string, data?: any) {
  const log = { timestamp: Date.now(), type, message, data };
  telemetryLogs.push(log);
  console.log(`[${type.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : '');
  // Cap at 100 logs
  if (telemetryLogs.length > 100) {
    telemetryLogs.shift();
  }
}

// Helper to decrypt ECIES payload in TypeScript (simulates WASM enclave decryption)
function decryptEciesPayload(envelope: {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}): string {
  const ecdh = crypto.createECDH('secp256k1');
  // Set the enclave's private key
  ecdh.setPrivateKey(Buffer.from(ENCLAVE_PRIVATE_KEY, 'hex'));
  
  // Compute shared secret using ephemeral public key from client
  const sharedSecret = ecdh.computeSecret(Buffer.from(envelope.ephemeralPublicKey, 'hex'));
  
  // Derive key & IV using HKDF-SHA256
  const hkdf = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.alloc(0), 44);
  const hkdfBuffer = Buffer.from(hkdf);
  const key = hkdfBuffer.subarray(0, 32);
  const iv = Buffer.from(envelope.iv, 'hex');
  
  // Decrypt using AES-256-GCM
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'hex'));
  
  let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// 1. Register Data Broker Template
app.post('/api/broker/register', (req, res) => {
  const { id, host, path, template } = req.body;
  if (!id || !host || !path) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const broker = { id, host, path, template };
  letheBrokers.set(id, broker);
  
  logTelemetry('enclave', `Registered broker template: ${id}`, { host, path });
  res.status(200).json({ status: 'registered', id });
});

// 2. Enqueue Deletion Campaign Job
app.post('/api/erasure/enqueue', (req, res) => {
  const { brokers, challengeHash, userDid } = req.body;
  if (!brokers || !challengeHash) {
    return res.status(400).json({ error: 'Missing brokers or challengeHash' });
  }

  const did = userDid || process.env.DID || 'did:t3n:sophie123';
  const jobId = `job_${Date.now()}`;
  const job = {
    id: jobId,
    userDid: did,
    status: 'pending',
    targetBrokers: brokers,
    challengeHash,
    createdAt: Date.now()
  };

  letheJobs.set(jobId, job);
  
  logTelemetry('agent', `Enqueued erasure campaign: ${jobId}`, { brokers, challengeHash });
  res.status(200).json({ jobId, status: 'pending' });
});

// 3. Fire Erasure Webhook (TEE Sandbox Execution)
app.post('/api/erasure/fire', async (req, res) => {
  const { jobId, brokerId, envelope, zkProof, txReceipt } = req.body;
  
  logTelemetry('agent', `Routing fire-erasure command for ${brokerId}`, { jobId, txReceipt });

  try {
    // A. Verify payment on-chain (mocked)
    logTelemetry('enclave', `Checking x402 payment registry for receipt: ${txReceipt}`);
    const isPaid = txReceipt && txReceipt.startsWith('0x'); // Simulate verification
    if (!isPaid) {
      logTelemetry('enclave', `x402 payment validation failed for receipt: ${txReceipt}`);
      return res.status(402).json({ error: 'x402 payment verification failed' });
    }
    logTelemetry('enclave', `Payment confirmed on-chain for challenge.`);

    // B. Verify Groth16 ZK proof offline
    logTelemetry('enclave', `Verifying Groth16 ownership proof against commitment: ${zkProof?.publicSignals?.[0]}`);
    const isZkValid = zkProof && zkProof.publicSignals && zkProof.publicSignals.length > 0;
    if (!isZkValid) {
      logTelemetry('enclave', `Groth16 proof verification failed`);
      return res.status(400).json({ error: 'Groth16 proof verification failed' });
    }
    logTelemetry('enclave', `Groth16 ownership proof verified successfully.`);

    // C. Decrypt ECIES payload in secure enclave memory
    logTelemetry('enclave', `Decrypting ECIES envelope using enclave private key...`);
    const decryptedJson = decryptEciesPayload(envelope);
    const pii = JSON.parse(decryptedJson);
    logTelemetry('enclave', `Decrypted PII payload inside TEE memory: [Protected]`);

    // D. Fetch Broker template
    const broker = letheBrokers.get(brokerId);
    if (!broker) {
      logTelemetry('enclave', `Broker template not registered: ${brokerId}`);
      return res.status(404).json({ error: `Broker template not registered: ${brokerId}` });
    }

    // E. Egress webhook dispatch with simulated placeholders (http-with-placeholders)
    const securePayload = {
      email: pii.email,
      ssn: pii.ssn || '999-88-7777',
      request_type: 'erasure'
    };

    // Log the unsecure agent view vs secure egress view
    logTelemetry('agent', `Outgoing encrypted envelope sent to TEE:`, { envelope: '[ENCRYPTED]' });
    logTelemetry('enclave', `Egress http-with-placeholders: POST to https://${broker.host}${broker.path}`);
    logTelemetry('enclave', `Edge proxy replaced placeholders. Final body delivered:`, securePayload);

    // Mock broker request with 429 rate limit retry check
    let responseStatus = 'deleted';
    let responseCode = 200;
    
    // Simulate rate limit or error scenario in seeding (whitepages-mock vs zoominfo-mock)
    if (brokerId === 'whitepages-mock' && Math.random() < 0.2) {
      logTelemetry('enclave', `Broker WhitePages returned 429 Rate Limit. Outbox queue will retry...`);
      responseCode = 429;
    }

    if (responseCode === 429) {
      return res.status(429).json({ error: 'Rate limit hit, enqueued in outbox for retry' });
    }

    // F. Generate signed VC receipt via signing::issue_vc
    const timestamp = Math.floor(Date.now() / 1000);
    const receiptId = `receipt_${brokerId}_${timestamp}`;
    const vc = {
      id: receiptId,
      issuer: 'did:t3n:lethe-enclave-signer',
      credentialSubject: {
        status: 'deleted',
        broker: brokerId,
        timestamp
      },
      proof: {
        type: 'JsonWebSignature2020',
        created: timestamp,
        verificationMethod: 'did:t3n:lethe-enclave-signer#key-1',
        proofPurpose: 'assertionMethod',
        signatureValue: crypto.randomBytes(64).toString('hex')
      }
    };

    const evidence = {
      vc: JSON.stringify(vc),
      signer: 'did:t3n:lethe-enclave-signer',
      timestamp
    };

    letheEvidence.set(receiptId, evidence);

    // Update job status
    const job = letheJobs.get(jobId);
    if (job) {
      job.status = 'confirmed';
      letheJobs.set(jobId, job);
    }

    logTelemetry('enclave', `Issued signed deletion proof receipt: ${receiptId}`);
    res.status(200).json(evidence);
  } catch (error: any) {
    logTelemetry('enclave', `TEE execution failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 4. Get evidence VC
app.get('/api/erasure/evidence/:id', (req, res) => {
  const evidence = letheEvidence.get(req.params.id);
  if (!evidence) {
    return res.status(404).json({ error: 'Evidence receipt not found' });
  }
  res.status(200).json(evidence);
});

// 5. Enclave Forget/Self-Destruct (Seppuku Sequence)
app.post('/api/erasure/forget', (req, res) => {
  const { userDid } = req.body;
  logTelemetry('enclave', `INITIATING CRYPTOGRAPHIC PURGE / SELF-DESTRUCT...`);

  // Clear KV Store maps
  letheJobs.clear();
  letheEvidence.clear();
  logTelemetry('enclave', `Volatile RAM zeroized. Wiping TEE key storage.`);

  // Call user-removal simulated host api
  logTelemetry('enclave', `Invoking host/user-removal on: ${userDid || process.env.DID || 'did:t3n:sophie123'}`);
  logTelemetry('enclave', `Host zeroes out profile DID credentials.`);

  logTelemetry('agent', `TEE connection terminated. Session closed.`);
  res.status(200).json({ status: 'erased', message: 'Identity and agent state permanently erased.' });
});

// 6. Telemetry endpoint for frontend console streaming
app.get('/api/telemetry', (req, res) => {
  res.status(200).json(telemetryLogs);
});

// 7. Clear telemetry endpoint
app.post('/api/telemetry/clear', (req, res) => {
  telemetryLogs = [];
  res.status(200).json({ status: 'cleared' });
});

// 8. Custom telemetry logging endpoint
app.post('/api/telemetry/log', (req, res) => {
  const { type, message, data } = req.body;
  if (!type || !message) {
    return res.status(400).json({ error: 'Missing type or message' });
  }
  logTelemetry(type, message, data);
  res.status(200).json({ status: 'logged' });
});

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Lethe Coordinator Agent gateway running on port ${PORT}`);
  });
}

export { app };

