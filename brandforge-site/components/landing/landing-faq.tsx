const FAQS = [
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
        <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Questions</p>
        <h2 id="faq-title" className="mt-2 font-serif text-3xl text-[#ece7de] sm:text-4xl">
          Asked before you ask
        </h2>
        <div className="mt-8 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-white/10 bg-[#1c2024] px-5 py-4"
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-[#ece7de]">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">{item.answer}</p>
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
