import { LetheClient } from './index';
import * as crypto from 'crypto';

describe('LetheClient SDK Unit Tests', () => {
  let enclavePubKey: string;
  let client: LetheClient;

  beforeAll(() => {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    enclavePubKey = ecdh.getPublicKey('hex');
  });

  beforeEach(() => {
    client = new LetheClient({
      rpcUrl: 'https://rpc.mock.test',
      enclaveUrl: 'http://localhost:8080'
    });
  });

  test('constructor stores config', () => {
    expect(client).toBeDefined();
  });

  test('generateZkProof creates valid mock proof structure', async () => {
    const proof = await client.generateZkProof('test@example.com', 'salt');
    expect(proof).toHaveProperty('pi_a');
    expect(proof).toHaveProperty('pi_b');
    expect(proof).toHaveProperty('pi_c');
    expect(proof).toHaveProperty('publicSignals');
    expect(proof.publicSignals[0]).toMatch(/^0x/);
  });

  test('encryptPayload successfully encrypts data and matches enclave structure', async () => {
    const pii = { email: 'test@example.com', ssn: '123-45-6789' };
    const envelope = await client.encryptPayload(pii, enclavePubKey);
    expect(envelope).toHaveProperty('ephemeralPublicKey');
    expect(envelope).toHaveProperty('iv');
    expect(envelope).toHaveProperty('ciphertext');
    expect(envelope).toHaveProperty('authTag');

    expect(envelope.ephemeralPublicKey).toMatch(/^04/);
    expect(envelope.ephemeralPublicKey.length).toBe(130);
  });

  test('verifyReceipt validates W3C VC shapes correctly', async () => {
    // Valid receipt
    const validVc = {
      issuer: 'did:t3n:lethe',
      credentialSubject: { status: 'deleted' },
      proof: { signatureValue: '0xsig' }
    };
    expect(await client.verifyReceipt(validVc)).toBe(true);

    // Invalid VC cases
    expect(await client.verifyReceipt(null)).toBe(false);
    expect(await client.verifyReceipt({})).toBe(false);
    expect(await client.verifyReceipt({ issuer: 'did:t3n:lethe' })).toBe(false);
    expect(await client.verifyReceipt({ issuer: 'did:t3n:lethe', credentialSubject: { status: 'active' } })).toBe(false);
    expect(await client.verifyReceipt({ issuer: 'did:other:lethe', credentialSubject: { status: 'deleted' }, proof: { signatureValue: '0xsig' } })).toBe(false);
  });

  test('enqueueErasure success path', async () => {
    const mockResponse = { jobId: 'job_123' };
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const envelope = await client.encryptPayload({ email: 'test@ex.com' }, enclavePubKey);
    const proof = await client.generateZkProof('test@ex.com', 'salt');

    const jobId = await client.enqueueErasure({
      envelope,
      zkProof: proof,
      brokers: ['broker-1'],
      paymentTxHash: '0xhash'
    });

    expect(jobId).toBe('job_123');
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/erasure/enqueue', expect.any(Object));
  });

  test('enqueueErasure non-ok response throws error', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      })
    );

    const envelope = await client.encryptPayload({ email: 'test@ex.com' }, enclavePubKey);
    const proof = await client.generateZkProof('test@ex.com', 'salt');

    await expect(
      client.enqueueErasure({
        envelope,
        zkProof: proof,
        brokers: ['broker-1'],
        paymentTxHash: '0xhash'
      })
    ).rejects.toThrow('Failed to enqueue erasure: Agent returned status 500');
  });

  test('enqueueErasure fetch rejection throws error', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.reject(new Error('Network failure'))
    );

    const envelope = await client.encryptPayload({ email: 'test@ex.com' }, enclavePubKey);
    const proof = await client.generateZkProof('test@ex.com', 'salt');

    await expect(
      client.enqueueErasure({
        envelope,
        zkProof: proof,
        brokers: ['broker-1'],
        paymentTxHash: '0xhash'
      })
    ).rejects.toThrow('Failed to enqueue erasure: Network failure');
  });

  test('selfDestruct success path', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
      })
    );

    const result = await client.selfDestruct('did:t3n:user');
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/erasure/forget', expect.any(Object));
  });

  test('selfDestruct non-ok response returns false', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
      })
    );

    const result = await client.selfDestruct('did:t3n:user');
    expect(result).toBe(false);
  });

  test('selfDestruct fetch rejection returns false', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.reject(new Error('Network failure'))
    );

    const result = await client.selfDestruct('did:t3n:user');
    expect(result).toBe(false);
  });
});
