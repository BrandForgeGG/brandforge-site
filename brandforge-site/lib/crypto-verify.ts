import { CHAINS, TRANSFER_TOPIC, assetOf, chainOf, exactMatch, hexOf, transfersTo, type Asset, type Chain } from '@/lib/crypto-chains.js';

// Reads one payment from the chain it was sent on, and watches our address for an invoice's exact amount. Free public
// endpoints only: EVM nodes (publicnode, with others tried in turn), TronGrid, Solana RPC, mempool.space for Bitcoin and
// litecoinspace.org for Litecoin. Nothing here trusts what the member typed except the transaction ID itself.

export type ChainTx = { found: boolean; success: boolean; units: bigint; confirmations: number; time: number | null };

const NOT_FOUND: ChainTx = { found: false, success: false, units: BigInt(0), confirmations: 0, time: null };
const ZERO = BigInt(0);

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

async function getJson<T>(url: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { status: res.status, data: null };
  return { status: res.status, data: (await res.json()) as T };
}

// ---- EVM chains (BNB Chain, Base, Polygon, Ethereum) ----

async function evmTx(asset: Asset, chain: Chain, hash: string, ours: string): Promise<ChainTx> {
  type Receipt = { status: string; blockNumber: string; logs: unknown[] } | null;
  // Public nodes are not always in step: "not found" from one is checked with the others before it is believed.
  let receipt: Receipt = null;
  for (const url of chain.rpc) {
    receipt = await rpc<Receipt>([url], 'eth_getTransactionReceipt', [hash]).catch(() => null);
    if (receipt) break;
  }
  if (!receipt) return NOT_FOUND;
  const [latest, block, tx] = await Promise.all([
    rpc<string>(chain.rpc, 'eth_blockNumber', []),
    rpc<{ timestamp: string } | null>(chain.rpc, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
    asset.token ? Promise.resolve(null) : rpc<{ to: string | null; value: string } | null>(chain.rpc, 'eth_getTransactionByHash', [hash]),
  ]);
  const toHex = ours.toLowerCase().slice(2);
  const units = asset.token
    ? transfersTo(receipt.logs, asset.token.toLowerCase().slice(2), toHex)
    : tx && String(tx.to ?? '').toLowerCase() === ours.toLowerCase()
      ? BigInt(tx.value)
      : ZERO;
  return {
    found: true,
    success: receipt.status === '0x1',
    units,
    confirmations: Number(BigInt(latest) - BigInt(receipt.blockNumber)) + 1,
    time: block ? Number(BigInt(block.timestamp)) * 1000 : null,
  };
}

async function evmTokenWatch(asset: Asset, chain: Chain, ours: string, sinceMs: number, units: bigint, cursor: number | null) {
  const latest = Number(BigInt(await rpc<string>(chain.logRpc, 'eth_blockNumber', [])));
  // First look: back to just before the invoice opened (with a margin), never more than one search span.
  const start = cursor !== null ? Math.max(0, cursor - 5) : latest - Math.min(chain.maxLogSpan, Math.ceil((Date.now() - sinceMs) / 1000 / chain.blockSeconds) + 200);
  const from = Math.max(start, latest - chain.maxLogSpan);
  type Log = { transactionHash: string; data: string };
  const logs = await rpc<Log[]>(chain.logRpc, 'eth_getLogs', [
    { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${latest.toString(16)}`, address: asset.token, topics: [`0x${TRANSFER_TOPIC}`, null, `0x${ours.toLowerCase().slice(2).padStart(64, '0')}`] },
  ]);
  const list = (logs ?? []).filter((log) => /^0x[0-9a-fA-F]{1,64}$/.test(log.data)).map((log) => ({ hash: log.transactionHash, units: BigInt(log.data) }));
  return { hash: exactMatch(list, units), cursor: latest };
}

/**
 * Native coins (BNB, ETH) leave no log to search, so we watch the balance: when it rises between two looks, a binary
 * search finds the block where it rose, and that block's transactions to us are checked for the exact amount.
 */
async function evmNativeWatch(chain: Chain, ours: string, sinceMs: number, units: bigint, cursor: number | null) {
  const nodes = chain.logRpc.length ? chain.logRpc : chain.rpc;
  const latest = Number(BigInt(await rpc<string>(nodes, 'eth_blockNumber', [])));
  // Nodes keep recent history only, so never look further back than about 100 blocks.
  const from = Math.max(cursor ?? latest - Math.ceil((Date.now() - sinceMs) / 1000 / chain.blockSeconds) - 5, latest - 100);
  const balance = async (block: number) => BigInt(await rpc<string>(nodes, 'eth_getBalance', [ours, `0x${block.toString(16)}`]));
  const base = await balance(from);
  if ((await balance(latest)) <= base) return { hash: null, cursor: latest };
  let lo = from;
  let hi = latest;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await balance(mid)) > base) hi = mid;
    else lo = mid;
  }
  type Block = { transactions: { hash: string; to: string | null; value: string }[] } | null;
  const block = await rpc<Block>(nodes, 'eth_getBlockByNumber', [`0x${hi.toString(16)}`, true]);
  const list = (block?.transactions ?? []).filter((t) => String(t.to ?? '').toLowerCase() === ours.toLowerCase()).map((t) => ({ hash: t.hash, units: BigInt(t.value) }));
  const hash = exactMatch(list, units);
  // Not ours (someone else's deposit): keep searching from just after that block on the next look.
  return { hash, cursor: hash ? latest : hi };
}

// ---- Tron ----

function tronHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = String(process.env.TRONGRID_API_KEY ?? '').trim();
  if (key) headers['TRON-PRO-API-KEY'] = key;
  return headers;
}

async function tronPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CHAINS.tron.rpc[0]}${path}`, { method: 'POST', headers: tronHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Tron ${res.status}`);
  return (await res.json()) as T;
}

async function tronTx(asset: Asset, hash: string, ours: string): Promise<ChainTx> {
  type Info = { id?: string; blockNumber?: number; blockTimeStamp?: number; receipt?: { result?: string }; log?: unknown[] };
  type Tx = { txID?: string; ret?: { contractRet?: string }[]; raw_data?: { contract?: { type?: string; parameter?: { value?: { amount?: number; to_address?: string } } }[] } };
  const [info, tx] = await Promise.all([tronPost<Info>('/wallet/gettransactioninfobyid', { value: hash }), asset.token ? Promise.resolve(null) : tronPost<Tx>('/wallet/gettransactionbyid', { value: hash })]);
  if (!info || !info.id || !info.blockNumber) {
    if (tx && tx.txID) return { found: true, success: true, units: ZERO, confirmations: 0, time: null };
    return NOT_FOUND;
  }
  const now = await tronPost<{ block_header?: { raw_data?: { number?: number } } }>('/wallet/getnowblock', {});
  const latest = Number(now.block_header?.raw_data?.number ?? 0);
  const toHex = hexOf('tron', ours) as string;
  let units = ZERO;
  let success = (info.receipt?.result ?? 'SUCCESS') === 'SUCCESS';
  if (asset.token) units = transfersTo(info.log, hexOf('tron', asset.token) as string, toHex);
  else {
    const contract = tx?.raw_data?.contract?.[0];
    success = (tx?.ret?.[0]?.contractRet ?? 'SUCCESS') === 'SUCCESS';
    if (contract?.type === 'TransferContract' && String(contract.parameter?.value?.to_address ?? '').toLowerCase() === `41${toHex}`) units = BigInt(contract.parameter?.value?.amount ?? 0);
  }
  return { found: true, success, units, confirmations: latest ? latest - info.blockNumber + 1 : 0, time: info.blockTimeStamp ?? null };
}

async function tronWatch(asset: Asset, ours: string, sinceMs: number, units: bigint) {
  const since = Math.max(0, sinceMs - 120_000);
  if (asset.token) {
    const url = `${CHAINS.tron.rpc[0]}/v1/accounts/${encodeURIComponent(ours)}/transactions/trc20?only_to=true&only_confirmed=false&limit=50&contract_address=${asset.token}&min_timestamp=${since}`;
    const { data } = await getJson<{ data?: { transaction_id?: string; value?: string; to?: string }[] }>(url, { headers: tronHeaders() });
    const list = (data?.data ?? []).filter((t) => t.to === ours && /^\d+$/.test(String(t.value))).map((t) => ({ hash: String(t.transaction_id), units: BigInt(String(t.value)) }));
    return exactMatch(list, units);
  }
  const url = `${CHAINS.tron.rpc[0]}/v1/accounts/${encodeURIComponent(ours)}/transactions?only_to=true&only_confirmed=false&limit=50&min_timestamp=${since}`;
  type Row = { txID?: string; raw_data?: { contract?: { type?: string; parameter?: { value?: { amount?: number; to_address?: string } } }[] } };
  const { data } = await getJson<{ data?: Row[] }>(url, { headers: tronHeaders() });
  const toHex = `41${hexOf('tron', ours)}`;
  const list = (data?.data ?? [])
    .map((row) => ({ row, contract: row.raw_data?.contract?.[0] }))
    .filter(({ contract }) => contract?.type === 'TransferContract' && String(contract.parameter?.value?.to_address ?? '').toLowerCase() === toHex)
    .map(({ row, contract }) => ({ hash: String(row.txID), units: BigInt(contract?.parameter?.value?.amount ?? 0) }));
  return exactMatch(list, units);
}

// ---- Bitcoin and Litecoin ----

type UtxoTx = { txid: string; status?: { confirmed?: boolean; block_height?: number; block_time?: number }; vout?: { scriptpubkey_address?: string; value?: number }[] };

function utxoUnits(tx: UtxoTx, ours: string): bigint {
  return (tx.vout ?? []).filter((out) => out.scriptpubkey_address === ours).reduce((sum, out) => sum + BigInt(out.value ?? 0), ZERO);
}

async function utxoTx(chain: Chain, hash: string, ours: string): Promise<ChainTx> {
  const { status, data } = await getJson<UtxoTx>(`${chain.rpc[0]}/tx/${hash}`);
  if (status === 404 || status === 400 || !data) return NOT_FOUND;
  let confirmations = 0;
  if (data.status?.confirmed && data.status.block_height) {
    const tip = await fetch(`${chain.rpc[0]}/blocks/tip/height`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text());
    confirmations = Number(tip) - data.status.block_height + 1;
  }
  return { found: true, success: true, units: utxoUnits(data, ours), confirmations, time: data.status?.block_time ? data.status.block_time * 1000 : null };
}

async function utxoWatch(chain: Chain, ours: string, units: bigint) {
  const { data } = await getJson<UtxoTx[]>(`${chain.rpc[0]}/address/${encodeURIComponent(ours)}/txs`);
  return exactMatch((data ?? []).map((tx) => ({ hash: tx.txid, units: utxoUnits(tx, ours) })), units);
}

// ---- Solana ----

type SolTx = {
  blockTime?: number | null;
  meta?: { err: unknown; preBalances?: number[]; postBalances?: number[]; preTokenBalances?: SolTokenBalance[]; postTokenBalances?: SolTokenBalance[] } | null;
  transaction?: { message?: { accountKeys?: ({ pubkey: string } | string)[] } };
} | null;
type SolTokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount?: { amount?: string } };

function solUnits(tx: SolTx, asset: Asset, ours: string): bigint {
  if (!tx || !tx.meta) return ZERO;
  if (asset.token) {
    const sum = (list: SolTokenBalance[] | undefined) =>
      (list ?? []).filter((b) => b.owner === ours && b.mint === asset.token).reduce((total, b) => total + BigInt(b.uiTokenAmount?.amount ?? '0'), ZERO);
    const delta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
    return delta > ZERO ? delta : ZERO;
  }
  const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const i = keys.indexOf(ours);
  if (i < 0) return ZERO;
  const delta = BigInt(tx.meta.postBalances?.[i] ?? 0) - BigInt(tx.meta.preBalances?.[i] ?? 0);
  return delta > ZERO ? delta : ZERO;
}

const SOL_TX_OPTIONS = { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' };

async function solanaTx(asset: Asset, hash: string, ours: string): Promise<ChainTx> {
  const nodes = CHAINS.solana.rpc;
  const tx = await rpc<SolTx>(nodes, 'getTransaction', [hash, SOL_TX_OPTIONS]);
  if (!tx) return NOT_FOUND;
  const statuses = await rpc<{ value: ({ confirmationStatus?: string } | null)[] }>(nodes, 'getSignatureStatuses', [[hash], { searchTransactionHistory: true }]);
  return {
    found: true,
    success: !tx.meta?.err,
    units: solUnits(tx, asset, ours),
    // Solana is final once finalized; until then it counts as zero confirmations.
    confirmations: statuses.value?.[0]?.confirmationStatus === 'finalized' ? 1 : 0,
    time: tx.blockTime ? tx.blockTime * 1000 : null,
  };
}

async function solanaWatch(asset: Asset, ours: string, sinceMs: number, units: bigint) {
  const nodes = CHAINS.solana.rpc;
  // Tokens land in our token account for that coin, not on the wallet address itself.
  let watched = [ours];
  if (asset.token) {
    const accounts = await rpc<{ value: { pubkey: string }[] }>(nodes, 'getTokenAccountsByOwner', [ours, { mint: asset.token }, { encoding: 'jsonParsed' }]);
    watched = (accounts.value ?? []).map((a) => a.pubkey);
    if (watched.length === 0) return null;
  }
  for (const address of watched) {
    const sigs = await rpc<{ signature: string; blockTime?: number | null; err: unknown }[]>(nodes, 'getSignaturesForAddress', [address, { limit: 20 }]);
    const recent = (sigs ?? []).filter((s) => !s.err && (!s.blockTime || s.blockTime * 1000 >= sinceMs - 120_000)).slice(0, 8);
    for (const sig of recent) {
      const tx = await rpc<SolTx>(nodes, 'getTransaction', [sig.signature, SOL_TX_OPTIONS]).catch(() => null);
      if (tx && solUnits(tx, asset, ours) === units) return sig.signature;
    }
  }
  return null;
}

/** The transaction as its chain sees it, measured against our receiving address there. */
export async function readChainTx(assetId: string, hash: string, ours: string): Promise<ChainTx> {
  const asset = assetOf(assetId);
  const chain = chainOf(asset);
  if (!asset || !chain) throw new Error('Unknown payment option.');
  if (chain.kind === 'evm') return evmTx(asset, chain, hash, ours);
  if (chain.kind === 'tron') return tronTx(asset, hash, ours);
  if (chain.kind === 'utxo') return utxoTx(chain, hash, ours);
  return solanaTx(asset, hash, ours);
}

/**
 * Looks for this invoice's payment without the member pasting anything: a transfer of exactly `units` to our address,
 * sent after `sinceMs`. `cursor` is where the last look stopped (a block number on EVM chains), so each look reads only
 * what is new. Returns the transaction ID when found, and the cursor for the next look.
 */
export async function findPayment(assetId: string, ours: string, sinceMs: number, units: bigint, cursor: number | null): Promise<{ hash: string | null; cursor: number | null }> {
  const asset = assetOf(assetId);
  const chain = chainOf(asset);
  if (!asset || !chain) return { hash: null, cursor };
  if (chain.kind === 'evm') return asset.token ? evmTokenWatch(asset, chain, ours, sinceMs, units, cursor) : evmNativeWatch(chain, ours, sinceMs, units, cursor);
  if (chain.kind === 'tron') return { hash: await tronWatch(asset, ours, sinceMs, units), cursor };
  if (chain.kind === 'utxo') return { hash: await utxoWatch(chain, ours, units), cursor };
  return { hash: await solanaWatch(asset, ours, sinceMs, units), cursor };
}
