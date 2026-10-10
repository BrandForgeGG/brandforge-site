const FAQS = [
  {
    question: 'What is BrandForge?',
    answer:
      'A workspace where AI and people work on the same page. Make and publish many kinds of messages, trade products, services and requests, and get a person to finish the job when you want one. AI drafts in seconds; people make it good.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'Every proposal carries a fixed price and timeline that you accept before anything is funded. Nothing is charged until you approve the proposal, and you can counter the offer in the chat.',
  },
  {
    question: 'How do payments work?',
    answer:
      'You fund the agreed total in crypto to the BrandForge escrow wallet. The transfer is verified on-chain, and milestone payments release only after you approve the delivered work. The rest stays with you.',
  },
  {
    question: 'Can I hire or get hired by other members?',
    answer:
      'Yes. Post what you offer or need in the Trade Center, agree terms in a private chat and sign a milestone contract there. The payer funds it, the other person submits each milestone, and the payer has 48 hours to approve or raise an issue before it releases. BrandForge keeps a flat 5% of each released milestone.',
  },
  {
    question: 'Who builds my project?',
    answer:
      'Vetted specialists — designers, developers, reverse engineers, and marketers. Your specialist joins your project chat with the proposal and stays there through delivery.',
  },
  {
    question: 'How long does it take?',
    answer:
      'Every proposal states delivery in weeks. Small builds ship in days, larger projects run in milestones you approve one by one.',
  },
  {
    question: 'What if something goes wrong?',
    answer:
      'Money only moves on your approval: escrow releases per milestone, and anything unapproved stays with you. Decline any proposal twice and that specialist is out; your brief stays open.',
  },
  {
    question: 'Why use BrandForge instead of AI alone?',
    answer:
      'AI is fast, but it does not stand behind the result. On BrandForge the AI drafts and a person finishes: you, your team or a vetted specialist. For paid work, funding is protected through milestone-based escrow, and you only pay after you approve what was delivered.',
  },
];

export function LandingFaq() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
  return (
    <section id="faq" className="bf-section" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl">
        <h2 id="faq-title" className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">
          Questions, answered
        </h2>
        <div className="mt-8 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-line bg-panel px-5 py-4"
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </div>
    </section>
  );
}
