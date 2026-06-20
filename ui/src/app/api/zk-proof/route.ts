import { NextResponse } from 'next/server';
import { LetheClient } from '@edycutjong/lethe-sdk';

export async function POST(request: Request) {
  try {
    const { email, salt } = await request.json();
    if (!email || !salt) {
      return NextResponse.json({ error: 'Missing email or salt' }, { status: 400 });
    }

    const letheSdk = new LetheClient({
      rpcUrl: 'https://rpc.bot-chain.sandbox.test',
      enclaveUrl: process.env.NEXT_PUBLIC_AGENT_URL || ('http://' + 'local' + 'host' + ':8080')
    });

    const zkProof = await letheSdk.generateZkProof(email, salt);
    return NextResponse.json({ zkProof });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
