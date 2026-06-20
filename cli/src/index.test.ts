import * as crypto from 'crypto';

// Generate mock keys dynamically at load time to avoid committing hardcoded secrets
const ecdh = crypto.createECDH('secp256k1');
ecdh.generateKeys();
process.env.ENCLAVE_PRIVATE_KEY = ecdh.getPrivateKey('hex');
process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY = ecdh.getPublicKey('hex');

let mockExistsSync = true;
let mockReadFileSyncContent = '{}';
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync,
  readFileSync: (p: string, encoding: string) => mockReadFileSyncContent,
  mkdirSync: (p: string, options?: any) => mockMkdirSync(p, options),
  writeFileSync: (p: string, data: string) => mockWriteFileSync(p, data),
}));

import * as fs from 'fs';
import * as path from 'path';

describe('Lethe CLI Unit Tests', () => {
  let originalArgv = process.argv;
  let originalExit = process.exit;
  let mockExit: jest.Mock;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;

  beforeAll(() => {
    mockExit = jest.fn() as any;
    process.exit = mockExit as any;
  });

  afterAll(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  beforeEach(() => {
    jest.resetModules();
    mockExit.mockClear();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn();
    
    // Reset state
    mockExistsSync = true;
    mockReadFileSyncContent = '{}';
    mockMkdirSync.mockClear();
    mockWriteFileSync.mockClear();

    // Reset env vars to mock keys
    process.env.ENCLAVE_PRIVATE_KEY = ecdh.getPrivateKey('hex');
    process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY = ecdh.getPublicKey('hex');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- 1. REGISTER COMMAND ---

  test('register - fails when template file does not exist', async () => {
    mockExistsSync = false;
    process.argv = ['node', 'lethe', 'register', '--broker-id', 'broker-1', '--template', 'missing-template.json'];
    
    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error: Template file not found'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('register - succeeds when template is valid and agent resolves ok', async () => {
    mockExistsSync = true;
    mockReadFileSyncContent = JSON.stringify({
      host: 'broker-1.test',
      path: '/delete',
      template: '{"email":"{{email}}"}'
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true
    });

    process.argv = ['node', 'lethe', 'register', '--broker-id', 'broker-1', '--template', 'valid-template.json'];
    
    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining("✓ Broker 'broker-1' registered successfully."));
  });

  test('register - fails when agent returns error status', async () => {
    mockExistsSync = true;
    mockReadFileSyncContent = JSON.stringify({});

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    process.argv = ['node', 'lethe', 'register', '--broker-id', 'broker-2', '--template', 'valid-template.json'];
    
    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('✗ Failed to register broker. Status: 500'));
  });

  test('register - handles fetch rejection/exceptions gracefully', async () => {
    mockExistsSync = true;
    mockReadFileSyncContent = JSON.stringify({});

    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

    process.argv = ['node', 'lethe', 'register', '--broker-id', 'broker-3', '--template', 'valid-template.json'];
    
    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error registering broker: Connection refused'));
  });

  // --- 2. ERASE COMMAND ---

  test('erase - fails when ENCLAVE_PUB_KEY is missing', async () => {
    delete process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY;
    delete process.env.ENCLAVE_PUB_KEY;
    process.argv = ['node', 'lethe', 'erase', '--email', 'sophie@del.com', '--ssn', '999-88-7777', '--brokers', 'broker-1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error: Enclave Public Key is not defined'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('erase - runs erasure campaign successfully', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job_123' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ vc: '{"id":"receipt_123","issuer":"did:t3n:lethe"}' })
      });

    process.argv = ['node', 'lethe', 'erase', '--email', 'sophie@del.com', '--ssn', '999-88-7777', '--brokers', 'broker-1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✓ Campaign enqueued successfully. Job ID: job_123'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✓ Deletion confirmed by broker-1.'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Campaign complete. All evidence receipts stored.'));
  });

  test('erase - handles fire failure scenario', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jobId: 'job_123' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400
      });

    process.argv = ['node', 'lethe', 'erase', '--email', 'sophie@del.com', '--ssn', '999-88-7777', '--brokers', 'broker-1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('✗ Deletion failed for broker-1. Status: 400'));
  });

  test('erase - handles enqueue failure scenario', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400
    });

    process.argv = ['node', 'lethe', 'erase', '--email', 'sophie@del.com', '--ssn', '999-88-7777', '--brokers', 'broker-1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Campaign execution failed: Failed to enqueue. Gateway status: 400'));
  });

  // --- 3. VERIFY-VC COMMAND ---

  test('verify-vc - fails when receipt file does not exist', async () => {
    mockExistsSync = false;
    process.argv = ['node', 'lethe', 'verify-vc', '--receipt', 'missing-receipt.json'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error: Receipt file not found'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('verify-vc - logs valid message for cryptographically valid receipt', async () => {
    mockExistsSync = true;
    const mockVc = {
      issuer: 'did:t3n:lethe',
      credentialSubject: {
        status: 'deleted',
        broker: 'broker-1',
        timestamp: 1781747879
      },
      proof: {
        signatureValue: '0xsig'
      }
    };
    mockReadFileSyncContent = JSON.stringify(mockVc);

    process.argv = ['node', 'lethe', 'verify-vc', '--receipt', 'valid-receipt.json'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ VALID RECEIPT: Cryptographic signature matches'));
  });

  test('verify-vc - logs invalid message for cryptographically invalid receipt', async () => {
    mockExistsSync = true;
    const mockVc = {
      issuer: 'did:other:untrusted',
      credentialSubject: {
        status: 'active',
        broker: 'broker-1',
        timestamp: 1781747879
      },
      proof: {
        signatureValue: '0xsig'
      }
    };
    mockReadFileSyncContent = JSON.stringify(mockVc);

    process.argv = ['node', 'lethe', 'verify-vc', '--receipt', 'invalid-receipt.json'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ INVALID RECEIPT: Signature check failed'));
  });

  test('verify-vc - handles JSON parsing errors gracefully', async () => {
    mockExistsSync = true;
    mockReadFileSyncContent = 'invalid-json';

    process.argv = ['node', 'lethe', 'verify-vc', '--receipt', 'invalid-receipt.json'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Verification error:'));
  });

  // --- 4. BENCHMARK COMMAND ---

  test('bench - fails when ENCLAVE_PUB_KEY is missing', async () => {
    delete process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY;
    delete process.env.ENCLAVE_PUB_KEY;
    process.argv = ['node', 'lethe', 'bench', '--runs', '1', '--concurrency', '1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error: Enclave Public Key is not defined'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('bench - fails when ENCLAVE_PRIVATE_KEY is missing', async () => {
    delete process.env.ENCLAVE_PRIVATE_KEY;
    process.argv = ['node', 'lethe', 'bench', '--runs', '1', '--concurrency', '1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error: Enclave Private Key is not defined'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('bench - executes performance latency benchmark suite successfully', async () => {
    process.argv = ['node', 'lethe', 'bench', '--runs', '2', '--concurrency', '1'];

    const { program } = require('./index');
    await program.parseAsync(process.argv);

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Running Lethe Performance Latency Benchmark Suite (2 iterations)...'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('### Latency Benchmark Results (ms)'));
  });
});
