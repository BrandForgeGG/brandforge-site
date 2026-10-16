import { addMessage, addSystemLine, addTeammateParticipant, announceReal, getProjectManager, markTaskFundFunded, recordFunnelEvent, verifyAgreementFunding } from '@/lib/project-db';
import { notify } from '@/lib/notify';
import { notifyFounder } from '@/lib/stage-notify';
import { postOpsEvent } from '@/lib/ops-events';

// What happens when an escrow agreement's money is confirmed, whoever confirmed it: staff checking by hand, or the
// automatic on-chain check of a crypto payment. One place, so both paths tell the chat, the founder, the team and the
// funnel exactly the same thing.
export async function completeAgreementFunding(
  agreement: { id: string; conversation_id: string; total_amount: number | string; currency: string },
  how: 'staff' | 'onchain' | 'card'
): Promise<boolean> {
  const result = await verifyAgreementFunding(agreement.id);
  if (!result) return false;

  await addMessage({
    conversation_id: result.conversationId,
    sender_type: 'ai',
    sender_name: 'BrandForge',
    content:
      how === 'card'
        ? 'Card payment received. The project is funded and delivery starts now. BrandForge holds the funds and releases them after the buyer approves the delivered work.'
        : how === 'onchain'
        ? 'Payment confirmed on-chain automatically. The project is funded and delivery starts now. BrandForge holds the funds and releases each milestone payment after the founder approves the delivered work.'
        : 'Payment verified on-chain. The project is funded and delivery starts now. BrandForge holds the funds and releases each milestone payment after the founder approves the delivered work.',
    content_type: 'system',
    artifact_data: { type: 'funding', id: agreement.id, status: 'funded' },
  });

  await markTaskFundFunded(agreement.id);
  // Every funded project gets the founder as its dedicated project manager, in the chat with the buyer and the specialists.
  const manager = await getProjectManager().catch(() => null);
  if (manager) {
    await addTeammateParticipant(result.conversationId, manager.id, manager.name);
    await addSystemLine(result.conversationId, `Your project manager: ${manager.name}, BrandForge founder. They lead this project with you and the specialists, start to finish.`);
  }

  // Verified means the money actually arrived.
  await recordFunnelEvent('funding_verified', {
    signedIn: true,
    properties: { total_amount: agreement.total_amount, stage: 'deliver', source: how },
  });
  await notify('payment_verified', { conversationId: agreement.conversation_id });
  await notifyFounder(agreement.conversation_id, 'funding_verified', {});
  // Verified money is the moment the public feed may claim funding: the staff embed carries the amount, the public line
  // stays outcome-only.
  await postOpsEvent('escrow_funded', { totalAmount: agreement.total_amount, currency: agreement.currency, conversationId: agreement.conversation_id });
  await announceReal('contract_funded', {}, [{ conversationId: agreement.conversation_id }]);
  return true;
}
