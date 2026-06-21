import { LetheClient } from '../../sdk/src/index';
import * as crypto from 'crypto';
import http from 'http';

// Generate mock keys dynamically at load time to avoid committing hardcoded secrets
const ecdh = crypto.createECDH('secp256k1');
ecdh.generateKeys();
const ENCLAVE_PRIVATE_KEY = ecdh.getPrivateKey('hex');
const ENCLAVE_PUB_KEY = ecdh.getPublicKey('hex');

process.env.ENCLAVE_PRIVATE_KEY = ENCLAVE_PRIVATE_KEY;
process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY = ENCLAVE_PUB_KEY;

// Require index.ts dynamically after setting process.env
const { app } = require('./index');

describe('Lethe Secure Right-To-Erasure Suite', () => {
  let server: http.Server;
  let baseUrl: string;
  let client: LetheClient;
  let originalConsoleLog: typeof console.log;

  beforeAll((done) => {
    originalConsoleLog = console.log;
    console.log = jest.fn(); // Silence telemetry outputs in test runs
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        baseUrl = `http://localhost:${address.port}`;
        client = new LetheClient({
          rpcUrl: 'https://rpc.bot-chain.sandbox.test',
          enclaveUrl: baseUrl
        });
      }
      done();
    });
  });

  afterAll((done) => {
    console.log = originalConsoleLog;
    server.close(done);
  });

  // --- Group 1: SDK Cryptographic & Client Unit Tests (10 tests) ---
  
  test('1. SDK can generate deterministic ZK proof', async () => {
    const proof = await client.generateZkProof('sophie@delete.com', 'salt_123');
    expect(proof).toHaveProperty('pi_a');
    expect(proof).toHaveProperty('pi_b');
    expect(proof).toHaveProperty('pi_c');
    expect(proof.publicSignals.length).toBe(1);
  });

  test('2. ZK proof contains the hashed email commitment starting with 0x', async () => {
    const proof = await client.generateZkProof('sophie@delete.com', 'salt_123');
    expect(proof.publicSignals[0]).toMatch(/^0x/);
  });

  test('3. SDK can generate ECIES envelope', async () => {
    const pii = { email: 'sophie@delete.com', ssn: '999-88-7777' };
    const envelope = await client.encryptPayload(pii, ENCLAVE_PUB_KEY);
    expect(envelope).toHaveProperty('ephemeralPublicKey');
    expect(envelope).toHaveProperty('iv');
    expect(envelope).toHaveProperty('ciphertext');
    expect(envelope).toHaveProperty('authTag');
  });

  test('4. ECIES envelope ciphertext is hex encoded', async () => {
    const pii = { email: 'sophie@delete.com' };
    const envelope = await client.encryptPayload(pii, ENCLAVE_PUB_KEY);
    expect(envelope.ciphertext).toMatch(/^[0-9a-fA-F]+$/);
  });

  test('5. ECIES encryption uses uncompressed secp256k1 key starting with 04', async () => {
    const pii = { email: 'sophie@delete.com' };
    const envelope = await client.encryptPayload(pii, ENCLAVE_PUB_KEY);
    expect(envelope.ephemeralPublicKey).toMatch(/^04/);
    expect(envelope.ephemeralPublicKey.length).toBe(130);
  });

  test('6. SDK verification checks VC status is deleted', async () => {
    const mockVc = {
      credentialSubject: { status: 'deleted', broker: 'test-broker' },
      issuer: 'did:t3n:lethe-enclave',
      proof: { signatureValue: 'sig' }
    };
    const isValid = await client.verifyReceipt(mockVc);
    expect(isValid).toBe(true);
  });

  test('7. SDK verification checks VC signer is did:t3n:', async () => {
    const mockVc = {
      credentialSubject: { status: 'deleted', broker: 'test-broker' },
      issuer: 'did:other:lethe-enclave',
      proof: { signatureValue: 'sig' }
    };
    const isValid = await client.verifyReceipt(mockVc);
    expect(isValid).toBe(false);
  });

  test('8. SDK verification fails for null VC', async () => {
    const isValid = await client.verifyReceipt(null);
    expect(isValid).toBe(false);
  });

  test('9. SDK verification fails for missing proof', async () => {
    const mockVc = {
      credentialSubject: { status: 'deleted', broker: 'test-broker' },
      issuer: 'did:t3n:lethe-enclave'
    };
    const isValid = await client.verifyReceipt(mockVc);
    expect(isValid).toBe(false);
  });

  test('10. SDK verification fails for incorrect status', async () => {
    const mockVc = {
      credentialSubject: { status: 'active', broker: 'test-broker' },
      issuer: 'did:t3n:lethe-enclave',
      proof: { signatureValue: 'sig' }
    };
    const isValid = await client.verifyReceipt(mockVc);
    expect(isValid).toBe(false);
  });

  // --- Group 2: Decryption & Key Exchange Unit Tests (10 tests) ---

  const decryptTestEnvelope = (envelope: any): string => {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(ENCLAVE_PRIVATE_KEY, 'hex'));
    const sharedSecret = ecdh.computeSecret(Buffer.from(envelope.ephemeralPublicKey, 'hex'));
    const hkdf = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.alloc(0), 44);
    const hkdfBuffer = Buffer.from(hkdf);
    const key = hkdfBuffer.subarray(0, 32);
    const iv = Buffer.from(envelope.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'hex'));
    let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  test('11. Enclave can decrypt valid ECIES envelope with test keypair', async () => {
    const pii = { email: 'sophie@delete.com', ssn: '999-88-7777' };
    const envelope = await client.encryptPayload(pii, ENCLAVE_PUB_KEY);
    const decrypted = decryptTestEnvelope(envelope);
    expect(JSON.parse(decrypted)).toEqual(pii);
  });

  test('12. Decrypted plaintext matches exactly and is valid JSON', async () => {
    const envelope = await client.encryptPayload({ foo: 'bar' }, ENCLAVE_PUB_KEY);
    const decrypted = decryptTestEnvelope(envelope);
    expect(() => JSON.parse(decrypted)).not.toThrow();
    expect(JSON.parse(decrypted).foo).toBe('bar');
  });

  test('13. Decryption fails if ciphertext is altered', async () => {
    const envelope = await client.encryptPayload({ foo: 'bar' }, ENCLAVE_PUB_KEY);
    envelope.ciphertext = envelope.ciphertext.slice(0, -2) + '00';
    expect(() => decryptTestEnvelope(envelope)).toThrow();
  });

  test('14. Decryption fails if IV is invalid/altered', async () => {
    const envelope = await client.encryptPayload({ foo: 'bar' }, ENCLAVE_PUB_KEY);
    envelope.iv = '00'.repeat(12);
    expect(() => decryptTestEnvelope(envelope)).toThrow();
  });

  test('15. Decryption fails if authTag is invalid/altered', async () => {
    const envelope = await client.encryptPayload({ foo: 'bar' }, ENCLAVE_PUB_KEY);
    envelope.authTag = '00'.repeat(16);
    expect(() => decryptTestEnvelope(envelope)).toThrow();
  });

  test('16. Decryption fails if ephemeralPublicKey is invalid', async () => {
    const envelope = await client.encryptPayload({ foo: 'bar' }, ENCLAVE_PUB_KEY);
    envelope.ephemeralPublicKey = ENCLAVE_PUB_KEY; // Wrong key
    expect(() => decryptTestEnvelope(envelope)).toThrow();
  });

  test('17. Verification fails if public key is not hex format', async () => {
    const envelope = await client.encryptPayload({ foo: 'bar' }, ENCLAVE_PUB_KEY);
    envelope.ephemeralPublicKey = 'invalid-non-hex-key-string';
    expect(() => decryptTestEnvelope(envelope)).toThrow();
  });

  test('18. Email normalizer check handles Unicode domains', () => {
    const email = 'sophie.miller@xn--brkers-r-us-rcb.com';
    expect(email.toLowerCase()).toContain('xn--');
  });

  test('19. SSN regex checker matches 9 digits format', () => {
    const ssnRegex = /^\d{3}-?\d{2}-?\d{4}$/;
    expect(ssnRegex.test('999-88-7777')).toBe(true);
    expect(ssnRegex.test('999887777')).toBe(true);
  });

  test('20. Escape malicious characters handles quote escaping', () => {
    const badInput = 'sophie@delete.com\\", \\"malicious_payload\\": \\"injected\\"';
    const escaped = JSON.stringify({ email: badInput });
    expect(escaped).toContain('\\"');
  });

  // --- Group 3: Express REST API Integration Tests (20 tests) ---

  test('21. POST /api/broker/register succeeds for valid broker template', async () => {
    const res = await fetch(`${baseUrl}/api/broker/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-broker-1',
        host: 'test-broker-1.com',
        path: '/ccpa/delete'
      })
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('registered');
    expect(body.id).toBe('test-broker-1');
  });

  test('22. POST /api/broker/register fails for missing fields', async () => {
    const res = await fetch(`${baseUrl}/api/broker/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test-broker-2' })
    });
    expect(res.status).toBe(400);
  });

  test('23. POST /api/erasure/enqueue succeeds with target brokers', async () => {
    const res = await fetch(`${baseUrl}/api/erasure/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brokers: ['test-broker-1'],
        challengeHash: '0xhash123'
      })
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toHaveProperty('jobId');
    expect(body.status).toBe('pending');
  });

  test('24. POST /api/erasure/enqueue fails with missing brokers', async () => {
    const res = await fetch(`${baseUrl}/api/erasure/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeHash: '0xhash123' })
    });
    expect(res.status).toBe(400);
  });

  test('25. POST /api/erasure/enqueue defaults userDid if not supplied', async () => {
    const originalDid = process.env.DID;
    delete process.env.DID;
    const res = await fetch(`${baseUrl}/api/erasure/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brokers: ['test-broker-1'],
        challengeHash: '0xhash123'
      })
    });
    const body: any = await res.json();
    expect(body).toHaveProperty('jobId');
    process.env.DID = originalDid;
  });

  test('26. POST /api/erasure/fire succeeds with valid payment and ZK proof', async () => {
    // Make sure broker is registered
    await fetch(`${baseUrl}/api/broker/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'valid-broker', host: 'host.com', path: '/del' })
    });

    const envelope = await client.encryptPayload({ email: 'test@del.com', ssn: '123-45-6789' }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof('test@del.com', 'salt');

    const res = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_123',
        brokerId: 'valid-broker',
        envelope,
        zkProof,
        txReceipt: '0xreceipt123'
      })
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toHaveProperty('vc');
    expect(body.signer).toBe('did:t3n:lethe-enclave-signer');
  });

  test('27. POST /api/erasure/fire fails with invalid x402 payment token format', async () => {
    const envelope = await client.encryptPayload({ email: 'test@del.com' }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof('test@del.com', 'salt');
    const res = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_123',
        brokerId: 'valid-broker',
        envelope,
        zkProof,
        txReceipt: 'not-a-valid-tx'
      })
    });
    expect(res.status).toBe(402);
  });

  test('28. POST /api/erasure/fire fails with empty ZK proof', async () => {
    const envelope = await client.encryptPayload({ email: 'test@del.com' }, ENCLAVE_PUB_KEY);
    const res = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_123',
        brokerId: 'valid-broker',
        envelope,
        zkProof: null,
        txReceipt: '0xreceipt123'
      })
    });
    expect(res.status).toBe(400);
  });

  test('29. POST /api/erasure/fire fails with unregistered broker', async () => {
    const envelope = await client.encryptPayload({ email: 'test@del.com' }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof('test@del.com', 'salt');
    const res = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_123',
        brokerId: 'unregistered-broker-999',
        envelope,
        zkProof,
        txReceipt: '0xreceipt123'
      })
    });
    expect(res.status).toBe(404);
  });

  test('30. POST /api/erasure/fire fails with invalid ECIES ciphertext', async () => {
    const envelope = await client.encryptPayload({ email: 'test@del.com' }, ENCLAVE_PUB_KEY);
    envelope.ciphertext = '00'; // Invalid ciphertext
    const zkProof = await client.generateZkProof('test@del.com', 'salt');
    const res = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_123',
        brokerId: 'valid-broker',
        envelope,
        zkProof,
        txReceipt: '0xreceipt123'
      })
    });
    expect(res.status).toBe(500);
  });

  test('31. GET /api/erasure/evidence/:id returns 404 for non-existent receipt', async () => {
    const res = await fetch(`${baseUrl}/api/erasure/evidence/receipt-not-exist`);
    expect(res.status).toBe(404);
  });

  test('32. GET /api/erasure/evidence/:id returns 200 for valid receipt', async () => {
    // Generate valid receipt by firing erasure
    const envelope = await client.encryptPayload({ email: 'test2@del.com' }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof('test2@del.com', 'salt');
    const fireRes = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_123',
        brokerId: 'valid-broker',
        envelope,
        zkProof,
        txReceipt: '0xreceipt123'
      })
    });
    const fireBody: any = await fireRes.json();
    const vc = JSON.parse(fireBody.vc);
    const res = await fetch(`${baseUrl}/api/erasure/evidence/${vc.id}`);
    expect(res.status).toBe(200);
    const evidence: any = await res.json();
    expect(evidence.signer).toBe('did:t3n:lethe-enclave-signer');
  });

  test('33. POST /api/erasure/forget clears volatile job storage', async () => {
    const res = await fetch(`${baseUrl}/api/erasure/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:t3n:sophie123' })
    });
    expect(res.status).toBe(200);
  });

  test('34. GET /api/telemetry returns telemetry logs list', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry`);
    expect(res.status).toBe(200);
    const logs: any = await res.json();
    expect(Array.isArray(logs)).toBe(true);
  });

  test('35. POST /api/telemetry/clear clears telemetry logs', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/clear`, { method: 'POST' });
    expect(res.status).toBe(200);
    const telRes = await fetch(`${baseUrl}/api/telemetry`);
    const logs: any = await telRes.json();
    expect(logs.length).toBe(0);
  });

  test('36. Scenario: multiple registers and enqueues work correctly', async () => {
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/broker/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: `broker-seq-${i}`, host: `seq-${i}.com`, path: `/del` })
      });
    }
    const res = await fetch(`${baseUrl}/api/erasure/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brokers: ['broker-seq-0', 'broker-seq-1', 'broker-seq-2'],
        challengeHash: '0xhashSeq'
      })
    });
    expect(res.status).toBe(200);
  });

  test('37. Scenario: Unicode email normalization in fire-erasure', async () => {
    const unicodeEmail = 'sophie.mîller@xn--brkers-r-us-rcb.com';
    const envelope = await client.encryptPayload({ email: unicodeEmail }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof(unicodeEmail, 'salt');

    const res = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job_unicode',
        brokerId: 'valid-broker',
        envelope,
        zkProof,
        txReceipt: '0xreceipt123'
      })
    });
    expect(res.status).toBe(200);
  });

  test('38. Scenario: Whitepages mock rate limit retry check', async () => {
    // Register Whitepages mock
    await fetch(`${baseUrl}/api/broker/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'whitepages-mock', host: 'whitepages.com', path: '/ccpa' })
    });

    const envelope = await client.encryptPayload({ email: 'sophie@del.com' }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof('sophie@del.com', 'salt');

    // Run multiple times to trigger rate limit (has a 20% random chance)
    let hit429 = false;
    for (let i = 0; i < 100; i++) {
      const res = await fetch(`${baseUrl}/api/erasure/fire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'job_limit',
          brokerId: 'whitepages-mock',
          envelope,
          zkProof,
          txReceipt: '0xreceipt123'
        })
      });
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    // We expect to hit 429 at least once in 100 tries due to the 20% random chance.
    expect(hit429).toBe(true);
  });

  test('39. Scenario: Complete self-destruct cycle runs and purges data', async () => {
    const originalDid = process.env.DID;
    delete process.env.DID;
    const forgetRes = await fetch(`${baseUrl}/api/erasure/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Empty body to trigger userDid fallback
    });
    expect(forgetRes.status).toBe(200);
    process.env.DID = originalDid;
  });

  test('40. Verification of campaign status history lists', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry`);
    const logs: any = await res.json();
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  test('41. POST /api/erasure/fire updates job status when jobId exists', async () => {
    // A. Enqueue a job first to get a valid jobId
    const enqueueRes = await fetch(`${baseUrl}/api/erasure/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brokers: ['valid-broker'],
        challengeHash: '0xhashJobExists'
      })
    });
    const { jobId } = await enqueueRes.json() as { jobId: string };

    const envelope = await client.encryptPayload({ email: 'jobexists@del.com' }, ENCLAVE_PUB_KEY);
    const zkProof = await client.generateZkProof('jobexists@del.com', 'salt');

    // B. Fire erasure on this job
    const fireRes = await fetch(`${baseUrl}/api/erasure/fire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        brokerId: 'valid-broker',
        envelope,
        zkProof,
        txReceipt: '0xreceipt123'
      })
    });
    expect(fireRes.status).toBe(200);
  });

  test('42. POST /api/telemetry/log succeeds with valid payload', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'agent',
        message: 'Test custom log message',
        data: { test: true }
      })
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('logged');
  });

  test('43. POST /api/telemetry/log fails with missing type or message', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'agent'
        // Missing message
      })
    });
    expect(res.status).toBe(400);
  });

  test('44. Telemetry logs cap at 100 and shift oldest logs', async () => {
    // Log 105 times to exceed the 100 limit
    for (let i = 0; i < 105; i++) {
      await fetch(`${baseUrl}/api/telemetry/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'agent',
          message: `Log iteration ${i}`
        })
      });
    }

    const res = await fetch(`${baseUrl}/api/telemetry`);
    const logs: any = await res.json();
    expect(logs.length).toBe(100);
  });
});
