// The questions a buyer asks before paying for a team plan, answered from how the product works today.
const FAQS = [
  {
    question: 'What do I get each month?',
    answer:
      'Development, design, video and marketing, done by real people. Add as many tasks as you like in your chat. We work on 1, 2 or 3 at a time, by plan, and you approve each one.',
  },
  {
    question: 'How do I start and pay?',
    answer:
      'Tell us about your brand in the chat. Once we agree what you get, the invoice arrives in that chat. Pay by card or crypto, monthly, and cancel any month.',
  },
  {
    question: "What if it isn't delivered?",
    answer:
      "If your first month's tasks aren't delivered, you get a full refund of that month. Ask in your chat within 14 days after the month ends.",
  },
  {
    question: 'Can I do some of it myself?',
    answer:
      'Yes. The AI tools are free to use: make videos, carousels and ads, and post them everywhere. Pro (€19 a month) gives the strongest AI and no monthly limits.',
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
    <section id="faq" className="border-t border-line px-5 py-16 sm:px-8" aria-labelledby="faq-title">
      <div className="mx-auto max-w-6xl">
        <h2 id="faq-title" className="text-center font-serif text-4xl text-foreground sm:text-5xl">
          Before you start
        </h2>
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
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
