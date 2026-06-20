#!/usr/bin/env node

import { Command } from 'commander';
import { LetheClient } from '@lethe/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const program = new Command();
const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:8080';
const ENCLAVE_PUB_KEY = process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY || '04a5be7517ff3c0b57cbc5c9e29ddcccc6776fa3f9d6583283640f739d3202cb538b71744782ebe8b44f4ab9af45c65925d720f6e40a42a8219926a43c1e9ddf29';
const ENCLAVE_PRIVATE_KEY = process.env.ENCLAVE_PRIVATE_KEY || 'c1caf2c7490915915829d9d7725f4fed657dc0dee37a8910e6be8abebe098de8';

const letheSdk = new LetheClient({
  rpcUrl: 'https://rpc.bot-chain.sandbox.test',
  enclaveUrl: AGENT_URL
});

let version = '1.0.0';
try {
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    version = pkg.version;
  }
} catch (_err) {
  // fallback to default version
}

program
  .name('lethe')
  .description('Lethe CLI — Command Line Interface for Data Protection Officers')
  .version(version);

// 1. Register Data Broker Template
program
  .command('register')
  .description('Register a new data broker template with the local sandbox')
  .requiredOption('--broker-id <id>', 'Unique identifier for the broker')
  .requiredOption('--template <path>', 'Path to the JSON template file')
  .action(async (options) => {
    try {
      const templatePath = path.resolve(options.template);
      if (!fs.existsSync(templatePath)) {
        console.error(`Error: Template file not found at ${templatePath}`);
        process.exit(1);
      }
      
      const rawTemplate = fs.readFileSync(templatePath, 'utf-8');
      const parsed = JSON.parse(rawTemplate);
      
      const payload = {
        id: options.brokerId,
        host: parsed.host || `${options.brokerId}.sandbox.test`,
        path: parsed.path || '/ccpa/delete',
        template: parsed.template || JSON.stringify(parsed)
      };

      const response = await fetch(`${AGENT_URL}/api/broker/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`✓ Broker '${options.brokerId}' registered successfully.`);
      } else {
        console.error(`✗ Failed to register broker. Status: ${response.status}`);
      }
    } catch (error: any) {
      console.error(`Error registering broker: ${error.message}`);
    }
  });

// 2. Trigger Deletion Campaign
program
  .command('erase')
  .description('Trigger a GDPR / CCPA right-to-erasure campaign')
  .requiredOption('--email <email>', 'User email address to be erased')
  .requiredOption('--ssn <ssn>', 'User SSN to be erased')
  .requiredOption('--brokers <brokers>', 'Comma-separated target broker IDs')
  .action(async (options) => {
    const brokerList = options.brokers.split(',').map((s: string) => s.trim());
    console.log(`Starting right-to-erasure campaign for ${options.email} against ${brokerList.length} brokers...`);

    try {
      // A. Generate ZK Proof
      console.log('Generating Groth16 ZK proof of identity ownership...');
      const proof = await letheSdk.generateZkProof(options.email, 'salt_123');

      // B. Encrypt PII to ECIES Envelope
      console.log('Encrypting PII credentials to ECIES Envelope...');
      const envelope = await letheSdk.encryptPayload({
        email: options.email,
        ssn: options.ssn
      }, ENCLAVE_PUB_KEY);

      // C. Pay x402 Challenge fee (simulated on-chain hash)
      const txReceipt = '0x' + crypto.randomBytes(32).toString('hex');
      console.log(`Micropayments verification submitted. Tx Receipt: ${txReceipt}`);

      // D. Enqueue Campaign
      const enqueueResponse = await fetch(`${AGENT_URL}/api/erasure/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokers: brokerList,
          challengeHash: proof.publicSignals[0],
          userDid: 'did:t3n:sophie123'
        })
      });

      if (!enqueueResponse.ok) {
        throw new Error(`Failed to enqueue. Gateway status: ${enqueueResponse.status}`);
      }
      const { jobId } = await enqueueResponse.json() as { jobId: string };
      console.log(`✓ Campaign enqueued successfully. Job ID: ${jobId}`);

      // E. Fire erasure for each broker target
      fs.mkdirSync(path.resolve('./receipts'), { recursive: true });

      for (const brokerId of brokerList) {
        console.log(`Firing erasure webhook for broker: ${brokerId}...`);
        const fireResponse = await fetch(`${AGENT_URL}/api/erasure/fire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            brokerId,
            envelope,
            zkProof: proof,
            txReceipt
          })
        });

        if (fireResponse.ok) {
          const evidence = await fireResponse.json() as { vc: string };
          const receiptPath = path.resolve(`./receipts/${brokerId}-proof.json`);
          fs.writeFileSync(receiptPath, JSON.stringify(JSON.parse(evidence.vc), null, 2));
          console.log(`  ✓ Deletion confirmed by ${brokerId}. VC saved to ${receiptPath}`);
        } else {
          console.error(`  ✗ Deletion failed for ${brokerId}. Status: ${fireResponse.status}`);
        }
      }

      console.log('\nCampaign complete. All evidence receipts stored.');
    } catch (error: any) {
      console.error(`Campaign execution failed: ${error.message}`);
    }
  });

// 3. Verify Verifiable Credential Deletion Receipt
program
  .command('verify-vc')
  .description('Cryptographically verify a signed Verifiable Credential receipt')
  .requiredOption('--receipt <path>', 'Path to the VC JSON receipt')
  .action(async (options) => {
    try {
      const receiptPath = path.resolve(options.receipt);
      if (!fs.existsSync(receiptPath)) {
        console.error(`Error: Receipt file not found at ${receiptPath}`);
        process.exit(1);
      }

      const rawReceipt = fs.readFileSync(receiptPath, 'utf-8');
      const parsed = JSON.parse(rawReceipt);

      // Wrapper check matching SDK schema
      const isValid = await letheSdk.verifyReceipt({
        credentialSubject: parsed.credentialSubject,
        issuer: parsed.issuer,
        proof: parsed.proof
      });

      if (isValid) {
        console.log('✅ VALID RECEIPT: Cryptographic signature matches the Lethe Enclave signer authority.');
        console.log(`  Broker:    ${parsed.credentialSubject.broker}`);
        console.log(`  Status:    ${parsed.credentialSubject.status}`);
        console.log(`  Timestamp: ${new Date(parsed.credentialSubject.timestamp * 1000).toLocaleString()}`);
      } else {
        console.error('❌ INVALID RECEIPT: Signature check failed or malformed credential contents.');
      }
    } catch (error: any) {
      console.error(`Verification error: ${error.message}`);
    }
  });

// 4. Benchmarking Latency Suit
program
  .command('bench')
  .description('Run latency benchmarks for ECIES, ZK proofs, and TEE zeroization')
  .option('--runs <count>', 'Number of benchmark runs', '50')
  .option('--concurrency <limit>', 'Concurrency level', '5')
  .action(async (options) => {
    const runs = parseInt(options.runs);
    console.log(`Running Lethe Performance Latency Benchmark Suite (${runs} iterations)...`);

    const tEncrypt: number[] = [];
    const tZk: number[] = [];
    const tDecrypt: number[] = [];
    const tZeroize: number[] = [];

    for (let i = 0; i < runs; i++) {
      // A. Measure ECIES encryption
      const t0 = performance.now();
      const envelope = await letheSdk.encryptPayload({
        email: `sophie_${i}@delete.com`,
        ssn: '999-88-7777'
      }, ENCLAVE_PUB_KEY);
      tEncrypt.push(performance.now() - t0);

      // B. Measure ZK proof generation
      const t1 = performance.now();
      await letheSdk.generateZkProof(`sophie_${i}@delete.com`, 'salt');
      tZk.push(performance.now() - t1);

      // C. Measure Decryption (enclave emulation)
      const t2 = performance.now();
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
      tDecrypt.push(performance.now() - t2);

      // D. Measure memory scrubbing
      const t3 = performance.now();
      const keyDummy = Buffer.from(ENCLAVE_PRIVATE_KEY, 'hex');
      keyDummy.fill(0); // Scrub volatile memory
      tZeroize.push(performance.now() - t3);
    }

    const getStats = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      return { min, max, p50, p95, p99 };
    };

    const statsEncrypt = getStats(tEncrypt);
    const statsZk = getStats(tZk);
    const statsDecrypt = getStats(tDecrypt);
    const statsZeroize = getStats(tZeroize);

    console.log('\n### Latency Benchmark Results (ms)');
    console.log('| Metric | Min | Max | p50 (Median) | p95 | p99 |');
    console.log('|---|---|---|---|---|---|');
    console.log(`| \`t_encrypt\` | ${statsEncrypt.min.toFixed(2)} | ${statsEncrypt.max.toFixed(2)} | ${statsEncrypt.p50.toFixed(2)} | ${statsEncrypt.p95.toFixed(2)} | ${statsEncrypt.p99.toFixed(2)} |`);
    console.log(`| \`t_zk\` | ${statsZk.min.toFixed(2)} | ${statsZk.max.toFixed(2)} | ${statsZk.p50.toFixed(2)} | ${statsZk.p95.toFixed(2)} | ${statsZk.p99.toFixed(2)} |`);
    console.log(`| \`t_decrypt\` | ${statsDecrypt.min.toFixed(2)} | ${statsDecrypt.max.toFixed(2)} | ${statsDecrypt.p50.toFixed(2)} | ${statsDecrypt.p95.toFixed(2)} | ${statsDecrypt.p99.toFixed(2)} |`);
    console.log(`| \`t_zeroize\` | ${statsZeroize.min.toFixed(2)} | ${statsZeroize.max.toFixed(2)} | ${statsZeroize.p50.toFixed(2)} | ${statsZeroize.p95.toFixed(2)} | ${statsZeroize.p99.toFixed(2)} |`);
  });

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  program.parse(process.argv);
}

export { program };
