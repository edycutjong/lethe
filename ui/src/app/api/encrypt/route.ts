import { NextResponse } from 'next/server';
import { LetheClient } from '@lethe/sdk';

export async function POST(request: Request) {
  try {
    const { pii, enclavePubKey } = await request.json();
    if (!pii || !enclavePubKey) {
      return NextResponse.json({ error: 'Missing pii or enclavePubKey' }, { status: 400 });
    }

    const letheSdk = new LetheClient({
      rpcUrl: 'https://rpc.bot-chain.sandbox.test',
      enclaveUrl: process.env.NEXT_PUBLIC_AGENT_URL || ('http://' + 'local' + 'host' + ':8080')
    });

    const envelope = await letheSdk.encryptPayload(pii, enclavePubKey);
    return NextResponse.json({ envelope });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
