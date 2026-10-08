import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service — BrandForge',
  description:
    'The terms that govern projects, admin-verified crypto escrow and milestone releases on BrandForge.',
};

const SECTIONS: LegalSection[] = [
  {
    title: '1. The service',
    body: [
      'BrandForge is a chat-first studio. You describe your project in a conversation; our AI helps structure the brief, and a human member of the BrandForge team reviews it and sends you a written proposal with scope, milestones and a total price. When you accept a proposal, it becomes a binding agreement between you and BrandForge.',
      'Work is delivered by vetted independent specialists ("operators") who are engaged and paid by BrandForge. BrandForge — not the individual operator — is your counterparty for every agreement.',
    ],
  },
  {
    title: '2. Accounts',
    body: [
      'You sign in with a Google account. You are responsible for everything that happens under your account, so keep your Google account secured. We may suspend accounts that abuse the service, harass staff or operators, or attempt to defraud other users.',
    ],
  },
  {
    title: '3. Proposals and agreements',
    body: [
      'A proposal describes the deliverables, milestones, timeline and total price in US dollars. You can accept it, decline it, or request changes in the chat. Nothing is binding and no money moves until you explicitly accept a proposal.',
      'Once accepted, the agreement can only be changed by mutual consent in the project chat. Material scope changes may result in a revised proposal.',
    ],
  },
  {
    title: '4. Funding and admin-verified escrow',
    body: [
      'Projects are funded in cryptocurrency. After you accept an agreement, you send the full agreement total to the BrandForge deposit wallet shown in your project panel and paste the transaction hash. A human member of the BrandForge team verifies the transfer on-chain before work begins. There is no smart contract and no automated payment processor: a person confirms every transfer.',
      'The dollar value of your funding is fixed at the agreement total at the moment our team verifies your transfer. BrandForge holds verified funds in escrow while work is delivered.',
      'Funds are released to operators milestone by milestone, and only after you approve the delivered work for that milestone in the chat. Funds are never auto-released without your approval.',
      'If we cannot verify your transaction (wrong amount, wrong network, hash not found), the funding is rejected and your agreement stays unfunded. Crypto you sent in error is handled case by case under the Refund Policy.',
    ],
  },
  {
    title: '5. Your responsibilities',
    body: [
      'Provide accurate project information, respond to milestone deliveries in a reasonable time, and only send funds from wallets you control. You confirm you are not funding projects with proceeds of illegal activity and that paying in crypto is legal in your jurisdiction.',
    ],
  },
  {
    title: '6. Operators',
    body: [
      'Operators are independent specialists vetted and supervised by BrandForge. They are not your employees or contractors; your agreement is with BrandForge. Do not pay operators directly — all payments run through the escrow described above, and BrandForge is not responsible for side deals.',
    ],
  },

  {
    title: '7. Intellectual property',
    body: [
      'You retain all rights to the materials and ideas you provide. Once an agreement is fully funded and the relevant milestones are approved and released, the final deliverables for those milestones are assigned to you. Work-in-progress, rejected drafts and internal tooling remain the property of BrandForge or the operator until paid for.',
    ],
  },
  {
    title: '8. Acceptable use',
    body: [
      'No illegal products or services, no malware or fraud tooling, no infringement of third-party rights, no spam. BrandForge may decline or cancel any project that violates these rules, subject to the Refund Policy for any funds held.',
    ],
  },
  {
    title: '9. Disclaimers and liability',
    body: [
      'The service is provided "as is". We work hard to vet operators and review deliverables, but we do not guarantee specific business outcomes from delivered work.',
      'To the maximum extent permitted by law, BrandForge is not liable for indirect or consequential damages, and our total liability for any claim is capped at the amount of fees BrandForge retained (not the escrowed principal) for the agreement giving rise to the claim in the three months before the event.',
      'Nothing in these terms limits liability that cannot be limited by law.',
    ],
  },
  {
    title: '10. Cancellation and termination',
    body: [
      'You may cancel a project at any time from the chat; refunds of escrowed funds follow the Refund Policy. BrandForge may cancel agreements that stall, violate these terms, or cannot be delivered, and will refund unreleased escrowed funds under the Refund Policy.',
    ],
  },
  {
    title: '11. Contracts between members and the Trade Center',
    body: [
      'Members can list services or requests in the Trade Center and sign milestone contracts with each other in a private chat. In these contracts BrandForge is not a party to the work: it provides the workspace, holds the verified deposit of the person paying, and releases it milestone by milestone. Sections 6 and 4 describe BrandForge-delivered projects; this section applies to member-to-member contracts.',
      'Before work starts, both people accept the written terms and the payer funds the contract. When the delivering person submits a milestone with a link to the finished work, the payer has 48 hours to approve it or raise an issue. If the payer does neither, that milestone is released automatically. If an issue is raised, release stops until a person at BrandForge reviews the work and decides to release or refund that milestone.',
      'BrandForge charges one flat percentage of each milestone when it is released (shown on the contract before anyone signs, and fixed once both people have signed). It is taken from the amount paid to the person delivering the work. There are no late fees and no interest on any plan or contract.',
      'Members are responsible for the quality, legality and taxes of the work they offer. BrandForge may decline to host listings or contracts for sectors it does not support, and may close listings that mislead.',
    ],
  },
  {
    title: '12. Changes and contact',
    body: [
      'We may update these terms as the product evolves; material changes are announced in our Discord and Telegram channels before they take effect. Continued use after the effective date means you accept the new terms.',
      'Questions: message the project manager on Telegram (@headstartup) or ask in our Discord. Links are on the homepage.',
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 8, 2026"
      intro="These terms govern your use of BrandForge: proposals, agreements, admin-verified crypto escrow, milestone releases and member contracts. They are written to be read — if anything is unclear, ask a human before you fund a project."
      sections={SECTIONS}
    />
  );
}
