export type NetworkId = 'bsc-usdt' | 'tron-usdt' | 'base-usdc';
export type Network = {
  id: NetworkId;
  label: string;
  short: string;
  kind: 'evm' | 'tron';
  chainId?: number;
  token: string;
  symbol: string;
  decimals: number;
  confirmations: number;
  trustCoin: number;
  feeNote: string;
  explorer: string;
  rpc: string[];
};
export type PaymentStatus = 'paid' | 'confirming' | 'failed' | 'wrong' | 'short' | 'early' | 'missing';
export const NETWORKS: Record<NetworkId, Network>;
export const NETWORK_IDS: NetworkId[];
export const TRANSFER_TOPIC: string;
export function isEvmAddress(value: unknown): boolean;
export function isTronAddress(value: unknown): boolean;
export function tronToHex(address: unknown): string | null;
export function addressFor(networkId: string, env: Record<string, string | undefined>): string;
export function enabledNetworks(env: Record<string, string | undefined>): NetworkId[];
export function normalizeTxHash(value: unknown, network?: Network): string | null;
export function amountFor(cents: number, rate: number, tag: number): string;
export function toUnits(amount: string, decimals: number): bigint;
export function fromUnits(units: bigint, decimals: number): string;
export function trustLink(networkId: string, address: string, amount: string): string;
export function paymentUri(networkId: string, address: string, amount: string): string;
export function transfersTo(logs: unknown, tokenHex: string, toHex: string): bigint;
export function hexOf(networkId: string, address: string): string | null;
export function judgePayment(
  tx: { found: boolean; success: boolean; units: bigint; confirmations: number; time: number | null } | null,
  invoice: { network: string; amount: string; createdAt: string }
): { status: PaymentStatus; note: string };
