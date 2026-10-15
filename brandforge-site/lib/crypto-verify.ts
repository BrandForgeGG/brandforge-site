import { NETWORKS, hexOf, transfersTo, type NetworkId } from '@/lib/crypto-chains.js';

// Reads one transaction from the chain it was sent on: whether it succeeded, how much of our stablecoin it sent to our
// address, how many blocks have confirmed it and when it happened. Free public endpoints only (each network has more
// than one, tried in turn), and nothing here trusts what the member typed except the transaction hash itself.

export type ChainTx = { found: boolean; success: boolean; units: bigint; confirmations: number; time: number | null };

const NOT_FOUND: ChainTx = { found: false, success: false, units: BigInt(0), confirmations: 0, time: null };

async function rpc<T>(urls: string[], method: string, params: unknown[]): Promise<T> {
  let last: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { result?: T; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message || 'rpc error');
      return data.result as T;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error('The network could not be reached.');
}

async function evmTx(networkId: NetworkId, hash: string, toHex: string): Promise<ChainTx> {
  const network = NETWORKS[networkId];
  type Receipt = { status: string; blockNumber: string; logs: unknown[] } | null;
  // Public nodes are not always in step: "not found" from one is checked with the others before it is believed.
  let receipt: Receipt = null;
  for (const url of network.rpc) {
    receipt = await rpc<Receipt>([url], 'eth_getTransactionReceipt', [hash]).catch(() => null);
    if (receipt) break;
  }
  if (!receipt) return NOT_FOUND;
  const [latest, block] = await Promise.all([
    rpc<string>(network.rpc, 'eth_blockNumber', []),
    rpc<{ timestamp: string } | null>(network.rpc, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
  ]);
  return {
    found: true,
    success: receipt.status === '0x1',
    units: transfersTo(receipt.logs, network.token.toLowerCase().slice(2), toHex),
    confirmations: Number(BigInt(latest) - BigInt(receipt.blockNumber)) + 1,
    time: block ? Number(BigInt(block.timestamp)) * 1000 : null,
  };
}

async function tronCall<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = String(process.env.TRONGRID_API_KEY ?? '').trim();
  if (key) headers['TRON-PRO-API-KEY'] = key;
  const res = await fetch(`${NETWORKS['tron-usdt'].rpc[0]}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Tron ${res.status}`);
  return (await res.json()) as T;
}

async function tronTx(hash: string, toHex: string): Promise<ChainTx> {
  type Info = { id?: string; blockNumber?: number; blockTimeStamp?: number; receipt?: { result?: string }; log?: unknown[] };
  const info = await tronCall<Info>('/wallet/gettransactioninfobyid', { value: hash });
  if (!info || !info.id || !info.blockNumber) return NOT_FOUND;
  const now = await tronCall<{ block_header?: { raw_data?: { number?: number } } }>('/wallet/getnowblock', {});
  const latest = Number(now.block_header?.raw_data?.number ?? 0);
  const tokenHex = hexOf('tron-usdt', NETWORKS['tron-usdt'].token) as string;
  return {
    found: true,
    success: (info.receipt?.result ?? 'SUCCESS') === 'SUCCESS',
    units: transfersTo(info.log, tokenHex, toHex),
    confirmations: latest ? latest - info.blockNumber + 1 : 0,
    time: info.blockTimeStamp ?? null,
  };
}

/** The transaction as the chain sees it, measured against our receiving address on that network. */
export async function readChainTx(networkId: NetworkId, hash: string, ourAddress: string): Promise<ChainTx> {
  const toHex = hexOf(networkId, ourAddress);
  if (!toHex) throw new Error('No receiving address is set for this network.');
  return NETWORKS[networkId].kind === 'tron' ? tronTx(hash, toHex) : evmTx(networkId, hash, toHex);
}
