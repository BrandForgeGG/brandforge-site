export type ChainId = 'bsc' | 'tron' | 'base' | 'polygon' | 'ethereum' | 'solana' | 'bitcoin' | 'litecoin';
export type AssetId =
  | 'usdt-tron'
  | 'usdt-bsc'
  | 'usdt-ethereum'
  | 'usdt-polygon'
  | 'usdt-solana'
  | 'usdc-base'
  | 'usdc-bsc'
  | 'usdc-solana'
  | 'usdc-polygon'
  | 'usdc-ethereum'
  | 'btc'
  | 'eth-ethereum'
  | 'eth-base'
  | 'bnb-bsc'
  | 'sol'
  | 'trx'
  | 'ltc';
export type Chain = {
  id: ChainId;
  name: string;
  kind: 'evm' | 'tron' | 'solana' | 'utxo';
  address: 'evm' | 'tron' | 'sol' | 'btc' | 'ltc';
  chainId?: number;
  trustCoin: number;
  native: string;
  nativeDecimals: number;
  confirmations: number;
  blockSeconds: number;
  feeNote: string;
  speed: string;
  explorer: string;
  rpc: string[];
  logRpc: string[];
  maxLogSpan: number;
  icon: string;
};
export type Asset = {
  id: AssetId;
  coin: string;
  name: string;
  chain: ChainId;
  token: string | null;
  decimals: number;
  places: number;
  stable: boolean;
  coingecko: string | null;
  binance: string | null;
};
export type PublicAsset = { id: AssetId; coin: string; name: string; stable: boolean; chain: ChainId; chainName: string; icon: string; chainIcon: string; feeNote: string; speed: string };
export type PaymentStatus = 'paid' | 'confirming' | 'failed' | 'wrong' | 'short' | 'early' | 'missing' | 'waiting';
export const CHAINS: Record<ChainId, Chain>;
export const ASSETS: Record<AssetId, Asset>;
export const ASSET_IDS: AssetId[];
export const ADDRESS_ENV: Record<Chain['address'], string>;
export const TRANSFER_TOPIC: string;
export function assetOf(id: string): Asset | null;
export function chainOf(asset: Asset | null): Chain | null;
export function isEvmAddress(value: unknown): boolean;
export function isTronAddress(value: unknown): boolean;
export function isSolanaAddress(value: unknown): boolean;
export function isUtxoAddress(value: unknown, chain: 'bitcoin' | 'litecoin'): boolean;
export function tronToHex(address: unknown): string | null;
export function addressFor(assetId: string, env: Record<string, string | undefined>): string;
export function enabledAssets(env: Record<string, string | undefined>): AssetId[];
export function normalizeTxHash(value: unknown, chain: Chain | null): string | null;
export function amountFor(cents: number, rate: number, tag: number, places?: number, coinPrice?: number): string;
export function toUnits(amount: string, decimals: number): bigint;
export function fromUnits(units: bigint, decimals: number): string;
export function trustLink(assetId: string, address: string, amount: string): string;
export function paymentUri(assetId: string, address: string, amount: string): string;
export function transfersTo(logs: unknown, tokenHex: string, toHex: string): bigint;
export function exactMatch(transfers: { hash: string; units: bigint }[], units: bigint): string | null;
export function hexOf(chainId: string, address: string): string | null;
export function judgePayment(
  tx: { found: boolean; success: boolean; units: bigint; confirmations: number; time: number | null } | null,
  invoice: { network: string; amount: string; createdAt: string }
): { status: PaymentStatus; note: string };
export function publicAsset(id: string): PublicAsset;
