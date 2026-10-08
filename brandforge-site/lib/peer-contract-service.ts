import {
  addMessage,
  announceReal,
  getUserNotifyTargets,
  peerRowToContract,
  recordFunnelEvent,
  savePeerContract,
  type PeerContractRow,
} from '@/lib/project-db';
import { notifyUser } from '@/lib/notify';
import { sendStageEmail } from '@/lib/email';
import { postOpsEvent } from '@/lib/ops-events';
import { resolveSiteUrl } from '@/lib/auth-utils';
import { formatMoney, settleDue } from '@/lib/peer-contract.js';

const LINES: Record<string, (who: string, title: string) => string> = {
  accepted: (who, title) => `${who} accepted "${title}". Waiting for the other person to accept.`,
  signed: (_who, title) => `Both people accepted "${title}". The payer can fund it now.`,
  revised: (who, title) => `${who} changed the terms of "${title}". Both people need to accept again.`,
  cancelled: (who, title) => `${who} withdrew "${title}".`,
  funding_submitted: (who, title) => `${who} submitted a deposit for "${title}". It is being checked.`,
  funded: (_who, title) => `The deposit for "${title}" is confirmed. Work can start.`,
  funding_rejected: (_who, title) => `The deposit for "${title}" could not be confirmed. The payer can send the reference again.`,
  submitted: (who, title) => `${who} submitted work on "${title}". The payer has 48 hours to approve or raise an issue.`,
  released: (_who, title) => `A milestone on "${title}" was released.`,
  disputed: (who, title) => `${who} raised an issue on "${title}". A person from BrandForge will review it.`,
  refunded: (_who, title) => `A milestone on "${title}" was refunded after review.`,
  paid: (_who, title) => `A payment for "${title}" was sent.`,
  auto_released: (_who, title) => `A milestone on "${title}" was released automatically after 48 hours with no objection.`,
};

// Everyone on the contract except whoever just acted (staff and the clock reach both people).
function recipients(row: PeerContractRow, actorId: string | null): string[] {
  return [row.payer_id, row.payee_id].filter((id) => id !== actorId);
}

// One chat line plus a best-effort ping to the other person on email and linked Telegram.
// Never throws: a delivery problem must not undo a contract change.
export async function announce(
  row: PeerContractRow,
  event: string,
  actor: { id: string | null; name: string },
  extra: { reason?: string; index?: number } = {}
) {
  const contract = peerRowToContract(row);
  const line = LINES[event];
  if (!line) return;
  const message = line(actor.name, contract.title);

  await addMessage({
    conversation_id: row.conversation_id,
    sender_type: 'ai',
    sender_name: 'BrandForge',
    content: message,
    content_type: 'system',
  });

  const chatUrl = `${resolveSiteUrl()}/chat?conversationId=${encodeURIComponent(row.conversation_id)}`;
  for (const userId of recipients(row, actor.id)) {
    try {
      const targets = await getUserNotifyTargets(userId);
      const details = { title: contract.title, message, chatUrl };
      if (targets.telegramChatId) await notifyUser(targets.telegramChatId, 'peer_update', details);
      if (targets.email) await sendStageEmail('peer_update', targets.email, details);
    } catch (cause) {
      console.warn('peer contract notify failed:', cause instanceof Error ? cause.message : cause);
    }
  }

  const common = { title: contract.title, currency: contract.currency, conversationId: row.conversation_id };
  if (event === 'signed') {
    await recordFunnelEvent('peer_contract_signed', {
      signedIn: true,
      properties: { total_amount: Math.round(contract.totalCents / 100), stage: 'agree' },
    });
    await postOpsEvent('contract_signed', { ...common, totalAmount: contract.totalCents / 100 });
    await announceReal('peer_contract_signed', {}, [{ userId: contract.payerId }, { userId: contract.payeeId }]);
  } else if (event === 'funding_submitted') {
    await postOpsEvent('peer_funding_review', { ...common, totalAmount: contract.totalCents / 100 });
  } else if (event === 'disputed') {
    await postOpsEvent('peer_dispute', { ...common, reason: extra.reason ?? '' });
  } else if ((event === 'released' || event === 'auto_released') && typeof extra.index === 'number') {
    const m = contract.milestones[extra.index];
    if (m) {
      await recordFunnelEvent('peer_contract_released', {
        signedIn: true,
        properties: { total_amount: Math.round(m.amountCents / 100), stage: 'deliver' },
      });
      await postOpsEvent('peer_released', {
        ...common,
        totalAmount: (m.amountCents - m.feeCents) / 100,
        feeLabel: formatMoney(m.feeCents, contract.currency),
      });
      await announceReal('milestone_released', {}, [{ userId: contract.payerId }, { userId: contract.payeeId }]);
    }
  }
}

// Releases any submitted milestone whose 48 hours have passed and tells everyone. Called on
// every read and by the daily cron, so the money never waits on someone opening the chat.
export async function settleIfDue(row: PeerContractRow): Promise<PeerContractRow> {
  const contract = peerRowToContract(row);
  const settled = settleDue(contract, new Date(), contract.feePercent);
  if (settled === contract) return row;

  const saved = await savePeerContract(row.id, settled, row.updated_at);
  if (!saved.ok) return row;

  for (let index = 0; index < settled.milestones.length; index += 1) {
    if (settled.milestones[index].status === 'released' && contract.milestones[index].status === 'submitted') {
      await announce(saved.row, 'auto_released', { id: null, name: 'BrandForge' }, { index });
    }
  }
  return saved.row;
}
