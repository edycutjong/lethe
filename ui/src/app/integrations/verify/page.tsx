'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface Transaction {
  hash: string;
  method: string;
  block: number;
  age: string;
  status: 'success' | 'reverted' | 'pending';
}

const INITIAL_TXS: Transaction[] = [
  {
    hash: '0x3fa2...a90b',
    method: 'registerAgent',
    block: 4589201,
    age: '2 mins ago',
    status: 'success'
  },
  {
    hash: '0x992b...e4a2',
    method: 'payChallengeFee',
    block: 4589204,
    age: '1 min ago',
    status: 'success'
  },
  {
    hash: '0x77cf...402c',
    method: 'createJob',
    block: 4589204,
    age: '1 min ago',
    status: 'success'
  }
];

export default function VerifyIntegrations() {
  const [activeEscrow, setActiveEscrow] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lethe_active_escrow') || '$500.00 USDC';
    }
    return '$500.00 USDC';
  });
  const [slaRatio, setSlaRatio] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lethe_sla_ratio') || '100.00%';
    }
    return '100.00%';
  });
  const [txs, setTxs] = useState<Transaction[]>(() => {
    if (typeof window !== 'undefined') {
      const storedTx = localStorage.getItem('lethe_slashed_tx');
      if (storedTx) {
        try {
          return [JSON.parse(storedTx), ...INITIAL_TXS];
        } catch {}
      }
    }
    return INITIAL_TXS;
  });

  const handleSimulateSlash = () => {
    const confirm = window.confirm('Trigger mock SLA violation slash? This simulates a data broker failing to delete within the 72 hour limit and awards $50.00 USDC to the user.');
    if (!confirm) return;

    const newTx: Transaction = {
      hash: (() => {
        const arr = window.crypto.getRandomValues(new Uint32Array(2));
        return '0x' + arr[0].toString(16).padStart(8, '0') + '...' + (arr[1] & 0xffff).toString(16).padStart(4, '0');
      })(),
      method: 'challengeSLA',
      block: 4589210,
      age: 'Just now',
      status: 'success'
    };

    setTxs(prev => [newTx, ...prev]);
    const nextSla = '97.50%';
    const nextEscrow = '$450.00 USDC';
    setSlaRatio(nextSla);
    setActiveEscrow(nextEscrow);
    localStorage.setItem('lethe_sla_ratio', nextSla);
    localStorage.setItem('lethe_active_escrow', nextEscrow);
    localStorage.setItem('lethe_slashed_tx', JSON.stringify(newTx));

    alert('Agent staked collateral slashed by $50.00 USDC. Compensation credited to user balance.');
  };

  return (
    <div className="grow flex flex-col min-h-screen bg-slate-950 text-slate-200 font-mono">
      {/* Cyberpunk Header */}
      <header className="sticky top-0 z-50 border-b border-slate-900 bg-slate-950/70 backdrop-blur-md px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link href="/" className="w-8 h-8 rounded border border-amber-500/30 flex items-center justify-center font-display font-extrabold text-amber-500 text-sm tracking-tighter hover:bg-amber-500/10">
            L
          </Link>
          <span className="font-display font-black tracking-widest text-lg text-slate-100">LETHE // VERIFY</span>
        </div>

        <Link href="/" className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-slate-100 rounded text-xs transition-all">
          &larr; Back to Console
        </Link>
      </header>

      {/* Main Content */}
      <main className="grow max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-display font-black uppercase tracking-wider text-slate-100 mb-2">Verified Contract Telemetry</h1>
          <p className="text-xs text-slate-400">Auditing the economic mechanics, SLA compliance, and x402 challenge payments on-chain.</p>
        </div>

        {/* Top Cards Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-slate-900 bg-slate-950/40 p-5 rounded-2xl flex flex-col justify-between h-32">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">Registry Staking Escrow</span>
            <span className="text-2xl font-bold text-amber-500 font-display">{activeEscrow}</span>
            <span className="text-[10px] text-slate-600">Locked in LetheStakingRegistry.sol</span>
          </div>

          <div className="border border-slate-900 bg-slate-950/40 p-5 rounded-2xl flex flex-col justify-between h-32">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">Agent SLA Compliance</span>
            <span className="text-2xl font-bold text-slate-200 font-display">{slaRatio}</span>
            <span className="text-[10px] text-slate-600">40 erasures / 0 SLA violations</span>
          </div>

          <div className="border border-slate-900 bg-slate-950/40 p-5 rounded-2xl flex flex-col justify-between h-32">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">USDC Collateral Pool</span>
            <span className="text-2xl font-bold text-emerald-500 font-display">$500.00 USDC</span>
            <span className="text-[10px] text-slate-600">Agent registry collateral deposit</span>
          </div>
        </div>

        {/* Addresses & Config */}
        <div className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Deployed Sandbox Contracts</h2>
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-900 pb-2">
              <span className="text-slate-500">Staking Registry (LetheStakingRegistry):</span>
              <span className="text-slate-300">0x62a26532B0301a90f47c216e52438fa0fba67123</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-900 pb-2">
              <span className="text-slate-500">USDC Token Mock (USDC):</span>
              <span className="text-slate-300">0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Lethe Enclave Key (secp256k1 Pub):</span>
              <span className="text-slate-300 truncate max-w-md">041dfac7ef6d7c24315e526f86e1e022da238bd09cdf3a...</span>
            </div>
          </div>
        </div>

        {/* Transactions list */}
        <div className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">On-Chain Transaction History</h2>
            <button 
              onClick={handleSimulateSlash}
              className="px-3 py-1.5 border border-red-500/30 bg-red-950/5 hover:border-red-500/50 hover:bg-red-950/10 text-red-500 text-[10px] uppercase font-bold rounded-lg transition-all"
            >
              Simulate SLA Slash
            </button>
          </div>

          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-900 text-slate-500">
                <th className="py-2.5">TX HASH</th>
                <th>METHOD</th>
                <th>BLOCK</th>
                <th>AGE</th>
                <th className="text-right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx, idx) => (
                <tr key={idx} className="border-b border-slate-900/40 text-slate-300">
                  <td className="py-3 text-amber-500 font-semibold">{tx.hash}</td>
                  <td><code>{tx.method}</code></td>
                  <td>{tx.block}</td>
                  <td>{tx.age}</td>
                  <td className="text-right">
                    <span className="px-2 py-0.5 bg-emerald-950/30 border border-emerald-500/30 text-emerald-500 rounded text-[10px]">
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
