import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Refund Policy — BrandForge',
  description:
    'How refunds work for BrandForge projects funded through admin-verified crypto escrow.',
};

const SECTIONS: LegalSection[] = [
  {
    title: '1. Before you fund',
    body: [
      'Discussing your project, receiving a proposal and even accepting an agreement costs nothing. If you change your mind before sending crypto, there is nothing to refund — just tell us in the chat.',
    ],
  },
  {
    title: '2. After funding, before work begins',
    body: [
      'If your transfer is verified but no milestone work has started, you can cancel and receive a full refund of the funded amount, minus the crypto network fees required to send it back. Refunds go to the wallet address you funded from, unless you ask otherwise in writing in the chat.',
    ],
  },
  {
    title: '3. During delivery',
    body: [
      'Escrowed funds are tied to milestones. Funds for milestones you have already approved and that have been released to the operator are earned and non-refundable.',
      'If you cancel mid-project, all unreleased milestone amounts are refunded minus network fees. Work already delivered stays yours.',
      'If BrandForge cancels your project (for example because it cannot be delivered), all unreleased funds are refunded minus network fees.',
    ],
  },
  {
    title: '4. Disputes',
    body: [
      'If you believe a delivered milestone does not match the agreement, do not approve it — tell us in the chat what is wrong. The team will mediate between you and the operator and either fix the delivery or refund that milestone. BrandForge\'s decision on milestone disputes is final, because a human reviews the actual delivered work.',
    ],
  },
  {
    title: '5. How refunds are paid',
    body: [
      'Refunds are sent in the same cryptocurrency and on the same network you funded with, valued at the crypto amount originally received (not a re-priced dollar amount), minus network fees. Because crypto prices move, the dollar value of a refund may be higher or lower than what you originally sent — that risk sits with the market, not with BrandForge.',
      'Refunds are processed by a human, typically within 7 days of confirmation. There are no chargebacks in crypto; the dispute process above is the replacement.',
    ],
  },
  {
    title: '6. Failed or mistaken transfers',
    body: [
      'If your transaction cannot be verified (wrong amount, wrong network, hash not found), your agreement is not funded and nothing is held. If you sent crypto to the deposit wallet in error, contact us immediately — recovery of mis-sent funds is attempted case by case and may not always be technically possible.',
    ],
  },
];

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="September 23, 2026"
      intro="Because BrandForge holds your funding in escrow and only releases it when you approve work, refunds are straightforward. This policy covers the cases in order: before funding, before work starts, during delivery, and disputes."
      sections={SECTIONS}
    />
  );
}
