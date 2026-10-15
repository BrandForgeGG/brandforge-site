// Three questions, the ones a first-time visitor actually has.
const FAQS = [
  {
    question: 'What is BrandForge?',
    answer:
      'One place to make content, publish it and get help from real people. You describe what you need in a chat; AI makes the first version in seconds (a launch video, a carousel, an ad, an article), you post or schedule it on your channels, and the BrandForge team or a member you hire from Trade can take it the rest of the way.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'Making and publishing is free. Pro (€19 a month) puts the strongest AI models on everything you make. A BrandForge team that delivers every month starts at €490. Hiring a member in Trade is a contract you agree on, paid per milestone, with a flat 5% fee when a milestone is paid.',
  },
  {
    question: 'Who reads my chat?',
    answer:
      'You and the official BrandForge team. A person from the team claims your chat and answers you there; the AI only answers when you ask it to. If you hire someone from Trade, they join that chat too.',
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
          Three questions, answered
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
