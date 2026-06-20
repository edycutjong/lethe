'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { ZkProof, EciesEnvelope } from '@edycutjong/lethe-sdk';

interface Broker {
  id: string;
  host: string;
  path: string;
  status: 'Active' | 'Sending' | 'Deleted';
  vcId?: string;
}

interface VerifiableCredential {
  id: string;
  issuer: string;
  credentialSubject: {
    status: string;
    broker: string;
    timestamp: number;
  };
  proof: {
    type: string;
    signatureValue: string;
  };
}

interface TelemetryLog {
  timestamp: number;
  type: 'agent' | 'enclave';
  message: string;
  data?: unknown;
}

export const ENCLAVE_PUB_KEY = process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY || '04a5be7517ff3c0b57cbc5c9e29ddcccc6776fa3f9d6583283640f739d3202cb538b71744782ebe8b44f4ab9af45c65925d720f6e40a42a8219926a43c1e9ddf29';
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || ('http://' + 'local' + 'host' + ':8080');
const MOCK_BROKERS = [
  'zoominfo-mock', 'whitepages-mock', 'spokeo-mock', 'beenverified-mock', 'radaris-mock',
  'intelius-mock', 'truthfinder-mock', 'instantcheckmate-mock', 'ussearch-mock', 'peoplesmart-mock',
  'peoplefinder-mock', 'privateeye-mock', 'publicrecords-mock', 'searchpeoplefree-mock', 'truepeoplesearch-mock',
  'cyberbackgroundchecks-mock', 'fastpeoplesearch-mock', 'locatepeople-mock', 'nationalbackground-mock', 'backgroundchecks-mock',
  'verispy-mock', 'checkmate-mock', 'peoplesearchnow-mock', 'smartbackgroundchecks-mock', 'idtrue-mock',
  'gladiknow-mock', 'peekyou-mock', 'zabasearch-mock', 'findpeoplesearch-mock', 'webmii-mock',
  'infotracer-mock', 'anywho-mock', 'lexisnexis-mock', 'experian-mock', 'equifax-mock',
  'transunion-mock', 'acxiom-mock', 'epsilon-mock', 'oracle-data-mock', 'salesforce-mock'
];

export default function LetheDashboard() {
  const [userDid, setUserDid] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isFunded, setIsFunded] = useState<boolean>(false);
  const [campaignState, setCampaignState] = useState<'idle' | 'running' | 'completed' | 'shredding' | 'shredded'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'deleted'>('all');
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
  const [selectedVc, setSelectedVc] = useState<VerifiableCredential | null>(null);
  
  // Real cryptographic params
  const [zkProof, setZkProof] = useState<ZkProof | null>(null);
  const [envelope, setEnvelope] = useState<EciesEnvelope | null>(null);
  const [txReceipt, setTxReceipt] = useState<string>('');
  
  // Grid data
  const [brokers, setBrokers] = useState<Broker[]>(() =>
    MOCK_BROKERS.map(id => ({
      id,
      host: `${id.split('-')[0]}.sandbox.test`,
      path: '/gdpr/delete',
      status: 'Active' as const
    }))
  );
  // Telemetry logs
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  // Evidence ledger VCs
  const [vcs, setVcs] = useState<VerifiableCredential[]>([]);
  
  // Timer SLA
  const [slaTime, setSlaTime] = useState<number>(72 * 60 * 60); // 72 hours in seconds

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Poll telemetry logs from the coordinator agent
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAuthenticated) {
      const fetchTelemetry = async () => {
        try {
          const res = await fetch(`${AGENT_URL}/api/telemetry`);
          if (res.ok) {
            const backendLogs = await res.json() as TelemetryLog[];
            if (backendLogs.length > 0) {
              setLogs(backendLogs);
            }
          }
        } catch {
          // Ignore polling errors
        }
      };

      fetchTelemetry();
      interval = setInterval(fetchTelemetry, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated]);

  // SLA Timer countdown
  useEffect(() => {
    if (campaignState === 'running') {
      const interval = setInterval(() => {
        setSlaTime(t => (t > 0 ? t - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [campaignState]);

  // Scroll terminal logs to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = async (type: 'agent' | 'enclave', message: string, data?: unknown) => {
    // Post to backend
    try {
      await fetch(`${AGENT_URL}/api/telemetry/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, data })
      });
    } catch {
      // If backend is offline, fallback directly to local state
      setLogs(prev => [...prev, { timestamp: Date.now(), type, message, data }]);
    }
  };

  // Flow Step 1: Wallet SIWE Onboarding
  const handleAuthenticate = async () => {
    await addLog('agent', 'Initiating SIWE auth challenge...');
    setTimeout(async () => {
      const activeDid = process.env.NEXT_PUBLIC_T3N_DID || 'did:t3n:sophie123';
      setUserDid(activeDid);
      setIsAuthenticated(true);
      await addLog('agent', `Onboarded user profile DID: ${activeDid}`);
      await addLog('enclave', 'Established encrypted session channel using M-L KEM key exchange.');
    }, 800);
  };

  // Flow Step 2: Granting delegation authorization
  const handleAuthorize = async () => {
    await addLog('agent', 'Compiling delegation policy schema...');
    try {
      // 1. ZK proof generation via UI API Route
      const zkRes = await fetch('/api/zk-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sophie.miller@gmail.com', salt: 'salt_123' })
      });
      if (!zkRes.ok) throw new Error('Failed to compile ZK Proof');
      const { zkProof: proof } = await zkRes.json();
      setZkProof(proof);
      await addLog('agent', 'Client generated Poseidon Hash commitment of email/SSN.');
      await addLog('agent', 'Groth16 ZK proof generated locally using snarkjs.');

      // 2. Encryption via UI API Route
      const encRes = await fetch('/api/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pii: { email: 'sophie.miller@gmail.com', ssn: '999-88-7777' },
          enclavePubKey: ENCLAVE_PUB_KEY
        })
      });
      if (!encRes.ok) throw new Error('Failed to encrypt PII');
      const { envelope: env } = await encRes.json();
      setEnvelope(env);
      await addLog('enclave', 'Agent authorized for scopes: [fire-erasure, forget-me]');
      setIsAuthorized(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await addLog('agent', `Authorization failed: ${errMsg}`);
    }
  };

  // Flow Step 3: Batch transactions for Funding & Escrow
  const handleFundCampaign = async () => {
    await addLog('agent', 'Preparing ERC-7715 transaction batch request...');
    setTimeout(async () => {
      const receipt = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setTxReceipt(receipt);
      setIsFunded(true);
      await addLog('enclave', 'Verified $500.00 USDC Agent SLA collateral locked in LetheStakingRegistry.');
      await addLog('enclave', 'Confirmed $2.00 USDC flat x402 challenge fee paid for 40 brokers.');
    }, 1200);
  };

  // Flow Step 4: Deletion sequence trigger
  const triggerCampaign = async () => {
    if (campaignState === 'running') return;
    setCampaignState('running');
    await addLog('agent', 'Triggering right-to-erasure campaign...');

    try {
      // Clear logs first on backend
      await fetch(`${AGENT_URL}/api/telemetry/clear`, { method: 'POST' });

      // Enqueue job on coordinator agent
      const enqueueRes = await fetch(`${AGENT_URL}/api/erasure/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokers: MOCK_BROKERS,
          challengeHash: zkProof?.publicSignals?.[0] || '0xmock_challenge',
          userDid: userDid || process.env.NEXT_PUBLIC_T3N_DID || 'did:t3n:sophie123'
        })
      });

      if (!enqueueRes.ok) {
        throw new Error(`Enqueue failed: ${enqueueRes.statusText}`);
      }

      const { jobId } = await enqueueRes.json() as { jobId: string };

      // Run parallel deletion loop
      for (let i = 0; i < brokers.length; i++) {
        const broker = brokers[i];
        
        // Update status to sending
        setBrokers(prev => prev.map(b => b.id === broker.id ? { ...b, status: 'Sending' } : b));
        
        // Delay to simulate network & enclave latency
        await new Promise(resolve => setTimeout(resolve, 150));

        // Fire erasure webhook on coordinator agent
        const fireRes = await fetch(`${AGENT_URL}/api/erasure/fire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            brokerId: broker.id,
            envelope,
            zkProof,
            txReceipt
          })
        });

        if (fireRes.ok) {
          const evidence = await fireRes.json();
          const vc = JSON.parse(evidence.vc);
          setBrokers(prev => prev.map(b => b.id === broker.id ? { ...b, status: 'Deleted', vcId: vc.id } : b));
          
          const newVc = {
            id: vc.id,
            issuer: vc.issuer,
            credentialSubject: {
              status: vc.credentialSubject.status,
              broker: vc.credentialSubject.broker,
              timestamp: vc.credentialSubject.timestamp
            },
            proof: {
              type: vc.proof.type,
              signatureValue: vc.proof.signatureValue
            }
          };
          setVcs(prev => [...prev, newVc]);
        } else {
          setBrokers(prev => prev.map(b => b.id === broker.id ? { ...b, status: 'Active' } : b));
        }

        setProgress(Math.floor(((i + 1) / brokers.length) * 100));
      }

      setCampaignState('completed');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await addLog('agent', `Campaign execution failed: ${errMsg}`);
      setCampaignState('idle');
    }
  };

  // Flow Step 5: Suicide / Self-destruct sequence
  const triggerSelfDestruct = async () => {
    const confirm = window.confirm('WARNING: This action is permanent and irreversible. Clicking OK zeroizes TEE RAM and triggers T3 user-removal to destroy Sophie\'s profile. Proceed?');
    if (!confirm) return;

    setCampaignState('shredding');

    try {
      await fetch(`${AGENT_URL}/api/erasure/forget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userDid: userDid || process.env.NEXT_PUBLIC_T3N_DID || 'did:t3n:sophie123' })
      });
      setTimeout(() => {
        setCampaignState('shredded');
      }, 2000);
    } catch {
      setCampaignState('shredded');
    }
  };

  const formatSlaTime = (s: number) => {
    const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
    const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const filteredBrokers = brokers.filter(b => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return b.status === 'Active' || b.status === 'Sending';
    if (activeTab === 'deleted') return b.status === 'Deleted';
    return true;
  });

  if (campaignState === 'shredded') {
    return (
      <div className="grow flex flex-col justify-center items-center bg-slate-950 p-8 text-center select-none font-mono">
        <div className="border border-red-500/30 bg-red-950/10 p-8 rounded-2xl max-w-lg shadow-[0_0_50px_rgba(239,68,68,0.05)]">
          <div className="text-red-500 text-6xl mb-6">&empty;</div>
          <h1 className="text-2xl font-bold text-slate-100 uppercase tracking-widest mb-4">Identity Erased</h1>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            The self-destruct sequence successfully zeroed out the enclave private keys, cleared namespaced KV store records, and called the <code>user-removal</code> API.
          </p>
          <div className="text-xs text-left bg-black/40 border border-slate-800 p-4 rounded-xl text-slate-500 overflow-x-auto leading-relaxed">
            <div>STATUS: 401 UNAUTHORIZED</div>
            <div>DID: {userDid || 'did:t3n:sophie123'} (REVOKED)</div>
            <div>STATE: DEAUTHORIZED / ZEROED</div>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-8 px-6 py-2 border border-slate-800 text-xs text-slate-400 hover:text-slate-100 hover:border-slate-600 rounded-lg transition-all"
          >
            Reinitialize Sandbox
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`grow flex flex-col min-h-screen bg-[#02040a] text-slate-200 relative ${campaignState === 'shredding' ? 'animate-glitch duration-75' : ''}`}>
      {/* Cyberpunk Header */}
      <header className="sticky top-0 z-50 border-b border-slate-900 bg-slate-950/70 backdrop-blur-md px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-amber-500/30 flex items-center justify-center font-display font-extrabold text-amber-500 text-sm tracking-tighter">
            L
          </div>
          <span className="font-display font-black tracking-widest text-lg text-slate-100">LETHE</span>
        </div>

        {/* Global Stats */}
        <div className="flex items-center gap-8 text-xs font-mono">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-slate-500">ESCROW ESCORT</span>
            <span className="text-amber-500 font-semibold">{isFunded ? '$500.00 USDC' : '$0.00'}</span>
          </div>
          <div className="hidden md:flex flex-col items-end">
            <span className="text-slate-500">SLA TARGET</span>
            <span className="text-slate-200 font-semibold">{formatSlaTime(slaTime)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">TEE ENCLAVE:</span>
            <div className="relative flex items-center justify-center w-5 h-5">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse-ring ${isAuthenticated ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              <svg className={`w-4 h-4 animate-spin-slow ${isAuthenticated ? 'text-emerald-400' : 'text-amber-400'}`} viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fill="none" strokeDasharray="30 20" />
              </svg>
            </div>
            <span className={`text-[10px] font-bold uppercase font-mono tracking-wider ${isAuthenticated ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isAuthenticated ? 'SECURED (Intel TDX)' : 'UNTRUSTED HOST'}
            </span>
          </div>
          <Link href="/integrations/verify" className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-slate-100 rounded transition-all">
            Verify Integrations
          </Link>
        </div>
      </header>

      {/* Main Console Panel */}
      <main className="grow max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-10 relative z-10">
        
        {/* Element 3: Hero Section */}
        <section className="text-center py-10 space-y-6 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/5 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 font-mono text-[10px] text-amber-500 tracking-widest uppercase mb-4">
            <span>GDPR ART. 17 / CCPA RIGHT-TO-ERASURE ORCHESTRATOR</span>
          </div>

          <h1 className="font-display font-black text-5xl sm:text-7xl text-slate-100 uppercase tracking-tight leading-[1.05]">
            Delete me from the internet. <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-amber-500 to-red-500">Then delete the agent too.</span>
          </h1>

          <p className="max-w-2xl mx-auto font-sans text-sm sm:text-base text-slate-400 leading-relaxed">
            Lethe is an autonomous GDPR data-erasure coordinator. It deploys smart enclaves to batch-purge your records across 40 data brokers, collects cryptographic erasure receipts, and self-destructs to leave no trace.
          </p>

          {/* Element 4: Primary CTA */}
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <a 
              href="#onboarding-console"
              className="px-8 py-3.5 rounded-xl font-mono text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,0.35)] active:scale-[0.98] transition-all flex items-center gap-2 group"
            >
              <span>LAUNCH DELETION CAMPAIGN</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </a>
            <a 
              href="#how-it-works"
              className="px-8 py-3.5 rounded-xl font-mono text-xs font-bold text-slate-200 border border-slate-800 hover:bg-slate-900 active:scale-[0.98] transition-all"
            >
              AUDIT SECURITY PROTOCOL
            </a>
          </div>

          {/* Element 5: Enhanced Social Proof / Statistics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto p-5 rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-sm font-mono text-xs text-slate-400 mt-10">
            <div className="flex flex-col gap-1 items-center border-r border-slate-850 last:border-0">
              <span className="text-slate-500 text-[10px]">INTEGRATED BROKERS</span>
              <span className="font-bold text-slate-200 text-sm mt-0.5">40 Registries</span>
            </div>
            <div className="flex flex-col gap-1 items-center border-r border-slate-850 last:border-0">
              <span className="text-slate-500 text-[10px]">COLLATERAL POOL</span>
              <span className="font-bold text-amber-500 text-sm mt-0.5">$500.00 USDC</span>
            </div>
            <div className="flex flex-col gap-1 items-center border-r border-slate-850 last:border-0">
              <span className="text-slate-500 text-[10px]">VERIFICATION TIME</span>
              <span className="font-bold text-emerald-500 text-sm mt-0.5">&lt; 150ms / Broker</span>
            </div>
            <div className="flex flex-col gap-1 items-center last:border-0">
              <span className="text-slate-500 text-[10px]">SUICIDE ZEROIZATION</span>
              <span className="font-bold text-red-500 text-sm mt-0.5">100% Volatile Purge</span>
            </div>
          </div>
        </section>

        {/* Onboarding steps if not ready */}
        {!isFunded && (
          <div id="onboarding-console" className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col gap-6 backdrop-blur-sm scroll-mt-24">
            <div>
              <h2 className="text-lg font-display font-bold uppercase tracking-wider text-slate-100 mb-2">Campaign Onboarding</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Complete the three-step cryptographically blinded identity delegation setup to proceed.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              {/* Step 1 */}
              <div className={`p-4 border rounded-xl flex flex-col justify-between gap-4 ${isAuthenticated ? 'border-emerald-500/30 bg-emerald-950/5' : 'border-slate-800 bg-slate-900/10'}`}>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400 uppercase">Step 1: SIWE Onboard</span>
                  {isAuthenticated && <span className="text-emerald-500">&check;</span>}
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">Authenticate with your Ethereum wallet to bind your decentralized identity did:t3n.</p>
                <button 
                  disabled={isAuthenticated}
                  onClick={handleAuthenticate}
                  className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 disabled:pointer-events-none rounded font-semibold text-center text-slate-300 hover:text-slate-100"
                >
                  {isAuthenticated ? 'Authenticated' : 'Onboard Wallet'}
                </button>
              </div>

              {/* Step 2 */}
              <div className={`p-4 border rounded-xl flex flex-col justify-between gap-4 ${isAuthorized ? 'border-emerald-500/30 bg-emerald-950/5' : 'border-slate-800 bg-slate-900/10'} ${!isAuthenticated ? 'opacity-40' : ''}`}>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400 uppercase">Step 2: Delegate Agent</span>
                  {isAuthorized && <span className="text-emerald-500">&check;</span>}
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">Sign permission scopes inside the TEE enclave and compile the offline Groth16 ownership proof.</p>
                <button 
                  disabled={!isAuthenticated || isAuthorized}
                  onClick={handleAuthorize}
                  className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 disabled:pointer-events-none rounded font-semibold text-center text-slate-300 hover:text-slate-100"
                >
                  {isAuthorized ? 'Authorized' : 'Authorize scopes'}
                </button>
              </div>

              {/* Step 3 */}
              <div className={`p-4 border rounded-xl flex flex-col justify-between gap-4 ${isFunded ? 'border-emerald-500/30 bg-emerald-950/5' : 'border-slate-800 bg-slate-900/10'} ${!isAuthorized ? 'opacity-40' : ''}`}>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400 uppercase">Step 3: Escrow & Micropayment</span>
                  {isFunded && <span className="text-emerald-500">&check;</span>}
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">Batch deposit $500 USDC SLA collateral and pay the broker micropayments challenge fee.</p>
                <button 
                  disabled={!isAuthorized || isFunded}
                  onClick={handleFundCampaign}
                  className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 disabled:pointer-events-none rounded font-semibold text-center text-slate-300 hover:text-slate-100"
                >
                  {isFunded ? 'Funded & escrowed' : 'Batch Fund'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero Trigger Section */}
        {isFunded && (
          <div className="border border-slate-900 bg-slate-950/20 p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 w-80 h-80 bg-linear-to-br from-amber-500/5 to-transparent rounded-full filter blur-2xl z-0 pointer-events-none"></div>
            
            <div className="z-10 max-w-xl">
              <h1 className="text-4xl font-display font-black tracking-wide text-slate-100 mb-2">ERASE ME EVERYWHERE</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sophie found her records on 40 data brokers. Fire the campaign to execute cryptographically blinded right-to-erasure webhooks. Plaintext credentials are only injected at the TEE network edge.
              </p>
            </div>

            <div className="z-10 flex flex-col gap-3 min-w-[200px] w-full md:w-auto font-mono">
              <button 
                onClick={triggerCampaign}
                disabled={campaignState === 'running' || campaignState === 'completed'}
                className="w-full px-8 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:pointer-events-none text-slate-950 rounded-xl font-bold font-display uppercase tracking-widest text-center shadow-[0_0_30px_rgba(245,158,11,0.2)] transition-all hover:scale-[1.02]"
              >
                {campaignState === 'running' ? 'ERASING...' : campaignState === 'completed' ? 'ERASED' : 'ERASE NOW'}
              </button>
              
              <div className="flex justify-between text-[10px] text-slate-500 px-1">
                <span>PROGRESS: {progress}%</span>
                <span>COMPLETED: {brokers.filter(b => b.status === 'Deleted').length} / 40</span>
              </div>
            </div>
          </div>
        )}

        {/* Campaign progress bar */}
        {campaignState !== 'idle' && (
          <div className="w-full bg-slate-900/60 h-2 rounded-full overflow-hidden border border-slate-800/40 relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
            <div 
              className="bg-linear-to-r from-amber-500 to-red-500 h-full transition-all duration-300 relative rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-white/20 blur-xs animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Grid & Logs Console Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left: 40 Broker Grid (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="font-display font-extrabold text-sm tracking-wider uppercase text-slate-400">Target Broker Registry</span>
              
              <div className="flex bg-slate-900/50 p-1 border border-slate-800 rounded-lg text-[10px] font-mono">
                <button onClick={() => setActiveTab('all')} className={`px-3 py-1 rounded ${activeTab === 'all' ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>ALL</button>
                <button onClick={() => setActiveTab('active')} className={`px-3 py-1 rounded ${activeTab === 'active' ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>FOUND</button>
                <button onClick={() => setActiveTab('deleted')} className={`px-3 py-1 rounded ${activeTab === 'deleted' ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>DELETED</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {filteredBrokers.map((broker) => (
                <div 
                  key={broker.id}
                  onClick={async () => {
                    if (broker.status !== 'Deleted' || !broker.vcId) return;
                    setSelectedBroker(broker);
                    setSelectedVc(null);
                    try {
                      const res = await fetch(`${AGENT_URL}/api/erasure/evidence/${broker.vcId}`);
                      if (res.ok) {
                        const evidence = await res.json();
                        setSelectedVc(JSON.parse(evidence.vc));
                      }
                    } catch (err) {
                      console.error('Failed to fetch evidence VC', err);
                    }
                  }}
                  className={`p-3 rounded-xl flex flex-col justify-between h-24 transition-all duration-300 relative overflow-hidden select-none cursor-pointer glass-card ${
                    broker.status === 'Deleted' 
                      ? 'border-emerald-500/30 bg-emerald-950/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                      : broker.status === 'Sending' 
                      ? 'border-amber-500/30 bg-amber-950/10 animate-pulse'
                      : 'border-slate-800/60 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <span className="font-mono text-[10px] text-slate-400 truncate">{broker.id}</span>
                  
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-slate-500 truncate">{broker.host}</span>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase font-mono ${
                      broker.status === 'Deleted' ? 'text-emerald-500' : broker.status === 'Sending' ? 'text-amber-500' : 'text-slate-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        broker.status === 'Deleted' ? 'bg-emerald-500' : broker.status === 'Sending' ? 'bg-amber-500 animate-ping' : 'bg-slate-500'
                      }`}></span>
                      {broker.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Live Telemetry Console (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <span className="font-display font-extrabold text-sm tracking-wider uppercase text-slate-400">Live Webhook Blinding Telemetry</span>
            
            <div className="border border-slate-900 bg-slate-950 rounded-2xl h-[420px] flex flex-col overflow-hidden shadow-2xl relative font-mono text-[11px]">
              <div className="bg-slate-900/60 px-4 py-2.5 border-b border-slate-900 flex justify-between items-center text-xs">
                <span>SPLIT-SCREEN WIRE-VIEW</span>
                <span className="text-[10px] text-slate-500">Agent vs TEE Egress</span>
              </div>

              <div className="grow overflow-y-auto p-4 flex flex-col gap-4 leading-relaxed">
                {logs.length === 0 ? (
                  <div className="grow flex justify-center items-center text-slate-600 text-xs italic">
                    Waiting for campaign initiation...
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className={`flex flex-col gap-1 border-l-2 pl-3 ${log.type === 'agent' ? 'border-amber-500/40' : 'border-emerald-500/40'}`}>
                      <div className="flex justify-between text-[9px]">
                        <span className={`font-semibold uppercase ${log.type === 'agent' ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {log.type === 'agent' ? 'Agent (Unsecure View)' : 'TEE Enclave (Decrypt Egress)'}
                        </span>
                        <span className="text-slate-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-300">{log.message}</p>
                      
                      {!!log.data && (
                        <pre className="text-[9px] bg-black/40 border border-slate-800 p-2 rounded text-slate-400 overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>

            {/* Selected Broker Evidence Modal */}
            {selectedBroker && (
              <div className="border border-emerald-500/20 bg-emerald-950/5 p-4 rounded-xl font-mono text-xs flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-500 text-[10px] uppercase tracking-wider">Signed Deletion Receipt</span>
                  <button onClick={() => { setSelectedBroker(null); setSelectedVc(null); }} className="text-slate-500 hover:text-slate-300">✕</button>
                </div>
                <div className="flex flex-col gap-1.5 text-slate-400 text-[11px]">
                  <div><span className="text-slate-500">Broker:</span> {selectedBroker.id}</div>
                  <div><span className="text-slate-500">Signer:</span> {selectedVc?.issuer || 'did:t3n:lethe-enclave-signer'}</div>
                  <div><span className="text-slate-500">VC Proof:</span> {selectedBroker.vcId}</div>
                </div>
                <pre className="bg-black/30 p-2 rounded text-[10px] text-slate-500 overflow-x-auto max-h-40">
                  {selectedVc 
                    ? JSON.stringify(selectedVc, null, 2)
                    : 'Loading receipt from enclave KV ledger...'
                  }
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Evidence Ledger Section */}
        {vcs.length > 0 && (
          <div className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col gap-4 backdrop-blur-sm">
            <h2 className="text-sm font-display font-extrabold uppercase tracking-wider text-slate-400">Signed Evidence Ledger</h2>
            <div className="flex flex-col gap-2 font-mono text-xs">
              {vcs.map((vc, idx) => (
                <div key={idx} className="flex justify-between items-center border border-slate-800/60 p-3 rounded-lg bg-slate-900/10">
                  <span className="text-slate-400">{vc.credentialSubject.broker} opt-out request</span>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-slate-500">{new Date(vc.credentialSubject.timestamp * 1000).toLocaleString()}</span>
                    <span className="px-2.5 py-0.5 border border-emerald-500/20 bg-emerald-950/30 text-emerald-500 text-[10px] font-bold rounded">SIGNED VC</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customer Testimonials (Element 8) */}
        <section className="max-w-7xl mx-auto py-4 relative z-10 w-full space-y-6">
          <div className="text-center">
            <h2 className="font-mono text-xs font-bold text-amber-500 uppercase tracking-[0.25em] mb-2">
              WHO IT&apos;S FOR
            </h2>
            <h3 className="font-mono text-2xl font-extrabold text-slate-100 uppercase tracking-tight">
              Built for People Who Need to Disappear
            </h3>
            <p className="font-mono text-[10px] text-slate-500 mt-3">
              Illustrative usage scenarios — not real testimonials. See the Hackathon Simulation Context below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: "I left an abusive relationship and needed every data broker that sells my address to forget me — fired as blinded GDPR requests, with cryptographic proof each one was sent.",
                persona: "At-risk individual",
                context: "Safety / stalking",
                badge: "AR"
              },
              {
                quote: "When a data-subject erasure request lands, I need it executed across all our brokers and the working copy of the PII wiped afterward, with a signed receipt for the audit file.",
                persona: "Data protection officer",
                context: "GDPR Art. 17 compliance",
                badge: "DPO"
              },
              {
                quote: "My real email and SSN are encrypted to the enclave key, so the coordinator never sees them — the requests go out PII-blind and the agent erases itself when done.",
                persona: "Privacy-first journalist",
                context: "Source / self protection",
                badge: "PJ"
              }
            ].map((item, idx) => (
              <div key={idx} className="bg-slate-900/20 border border-slate-900 rounded-xl p-5 hover:border-amber-500/20 transition-colors flex flex-col justify-between">
                <p className="text-xs text-slate-350 italic mb-5 leading-relaxed">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-500 flex items-center justify-center font-mono text-[10px] font-bold">
                    {item.badge}
                  </span>
                  <div className="flex flex-col font-mono">
                    <span className="text-[11px] font-bold text-white">{item.persona}</span>
                    <span className="text-[9px] text-slate-500">{item.context}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        
        {/* Final CTA (Element 10) */}
        <section className="bg-linear-to-r from-amber-950/20 via-[#0a0b0d] to-red-950/10 border border-amber-900/30 rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-red-600/5 blur-3xl rounded-full" />
          
          <div className="max-w-2xl mx-auto space-y-5 relative z-10">
            <h3 className="text-xl md:text-3xl font-bold font-display tracking-wide text-slate-100 uppercase">
              RECLAIM YOUR DIGITAL FOOTPRINT
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 font-mono max-w-xl mx-auto leading-relaxed">
              Subscribe to receive updates on Lethe&apos;s decentralized SDK integrations and new automated broker sweeps.
            </p>
            
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto pt-2" suppressHydrationWarning={true}>
              <input 
                type="email" 
                placeholder="Enter email or secure DID..." 
                className="grow px-4 py-3 rounded-lg border border-slate-800 bg-black/40 font-mono text-xs text-white focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                required
                suppressHydrationWarning={true}
              />
              <button 
                type="submit"
                onClick={() => {
                  alert("Successfully subscribed to Lethe updates!");
                }}
                className="bg-amber-500 hover:bg-amber-400 hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] text-slate-950 font-mono text-xs px-6 py-3 rounded-lg font-bold transition-all active:scale-[0.98]"
                suppressHydrationWarning={true}
              >
                SUBSCRIBE
              </button>
            </form>
          </div>
        </section>

        {/* FAQ Explanation (Element 9) */}
        <div id="how-it-works" className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col gap-4 backdrop-blur-sm scroll-mt-24">
          <h2 className="text-sm font-display font-extrabold uppercase tracking-wider text-slate-400">How Lethe Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed">
            <div>
              <h3 className="font-bold text-slate-200 mb-2">1. Secure TEE Blinding</h3>
              <p className="text-slate-400">
                Plaintext data (email, phone, SSN) is encrypted locally using the enclave&apos;s public key before routing. The coordinator agent only handles ciphertext, protecting your privacy from external honeypots.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-slate-200 mb-2">2. x402 Micropayments</h3>
              <p className="text-slate-400">
                To safeguard the network from spam, each deletion payload request requires a Keccak-256 micro-payment fee verification checked directly on-chain by the enclave before egress execution.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-slate-200 mb-2">3. Self-Destruct Sequence</h3>
              <p className="text-slate-400">
                Once the deletion campaigns are verified, trigger the purge. The TEE zeroizes private key exponents in volatile RAM and invokes `user-removal` to wipe your sandbox records entirely.
              </p>
            </div>
          </div>
        </div>

        {/* Suicide Warning Big Trigger (Gated by Completed) */}
        {campaignState === 'completed' && (
          <div className="border border-red-500/30 bg-red-950/5 p-8 rounded-2xl flex flex-col justify-center items-center text-center gap-4 relative overflow-hidden">
            <h2 className="text-lg font-display font-bold uppercase tracking-widest text-red-500">Initiate Cryptographic Purge</h2>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Once you have downloaded your Signed Verifiable Credentials, execute the purge. This destroys all session parameters, wipes the KV mapping namespaces, and calls `user-removal` to delete the sandbox record.
            </p>
            <button 
              onClick={triggerSelfDestruct}
              className="mt-2 px-8 py-3 border border-red-500 hover:bg-red-500/10 text-red-500 text-xs font-mono uppercase tracking-widest rounded-xl transition-all font-bold"
            >
              Purge Identity & Self-Destruct
            </button>
          </div>
        )}

      </main>

      {/* Hackathon Simulation Context (honesty disclaimer) */}
      <section className="max-w-4xl mx-auto px-8 mt-12 w-full">
        <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/2 flex flex-col gap-3">
          <h3 className="font-mono text-xs font-bold text-amber-500 uppercase">Hackathon Simulation Context</h3>
          <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
            Lethe is a demo built for the DoraHacks T3 ADK Launch Edition. The enclave, broker erasure egress,
            x402 payment checks, and self-destruct run in a <span className="text-slate-200">local sandbox</span> against
            simulated Terminal 3 host APIs — no real GDPR requests are sent and the broker directory is seeded test data.
            The personas above are <span className="text-slate-200">illustrative use cases, not real testimonials</span>.
            What is real: a Rust&rarr;WASM enclave contract, PII-blind <span className="text-slate-200">http-with-placeholders</span> egress,
            enclave-signed VC receipts, and the <span className="text-slate-200">user-removal</span> self-destruct flow.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-slate-500 mt-12">
        <div>
          <span>&copy; {new Date().getFullYear()} Lethe Autonomous Deletion Agent. MIT License.</span>
        </div>
        <div className="flex gap-4">
          <a href="#" className="hover:text-slate-300">TypeScript SDK</a>
          <a href="#" className="hover:text-slate-300">lethe-cli</a>
          <a href="#" className="hover:text-slate-300">Terminal 3 Sandbox</a>
        </div>
      </footer>
    </div>
  );
}
