import { getProfileDisplayName, peerRowToContract, type PeerContractRow } from '@/lib/project-db';
import { summarize, formatMoney, payoutsDue } from '@/lib/peer-contract.js';

// What the card needs, from one viewer's seat. Never includes the other side's payment reference.
export async function toPeerView(row: PeerContractRow, viewerId: string, isStaff: boolean) {
  const contract = peerRowToContract(row);
  const [payerName, payeeName] = await Promise.all([
    getProfileDisplayName(contract.payerId),
    getProfileDisplayName(contract.payeeId),
  ]);
  const side = viewerId === contract.payerId ? 'payer' : viewerId === contract.payeeId ? 'payee' : null;
  const summary = summarize(contract);
  return {
    id: contract.id,
    conversationId: contract.conversationId,
    title: contract.title,
    scope: contract.scope,
    currency: contract.currency,
    dueDate: contract.dueDate,
    status: contract.status,
    fundingStatus: contract.fundingStatus,
    // The payment reference is the payer's (and staff's) business only.
    fundingTx: side === 'payer' || isStaff ? contract.fundingTx : null,
    feePercent: contract.feePercent,
    signatures: contract.signatures,
    milestones: contract.milestones,
    totalCents: contract.totalCents,
    payer: { id: contract.payerId, name: payerName },
    payee: { id: contract.payeeId, name: payeeName },
    viewerSide: side,
    viewerIsStaff: isStaff,
    summary,
    payoutsDue: payoutsDue(contract),
    totalLabel: formatMoney(contract.totalCents, contract.currency),
  };
}

export type PeerView = Awaited<ReturnType<typeof toPeerView>>;
