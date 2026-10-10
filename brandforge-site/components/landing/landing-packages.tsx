import Link from 'next/link';

export const PACKAGES = [
  { key: 'launch', name: 'Launch', desc: 'Get it into the world.', items: ['Websites', 'Landing pages', 'Brand systems', 'Prototypes'], price: '€500+' },
  { key: 'build', name: 'Build', desc: 'Turn the idea into a working product.', items: ['SaaS', 'Web apps', 'Bots & automation', 'AI integrations'], price: '€1,500+' },
  { key: 'product', name: 'Product', desc: 'Build the real thing.', items: ['Mobile apps', 'Marketplaces', 'Complex platforms', 'Custom software'], price: '€3,000+' },
  { key: 'scale', name: 'Scale', desc: 'Keep building after launch.', items: ['Features', 'AI', 'Automation', 'Growth'], price: 'Custom' },
] as const;

export function LandingPackages() {
  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map((pkg) => (
            <Link
              key={pkg.key}
              href={`/chat?pkg=${pkg.key}`}
              className="rounded-2xl border border-line bg-panel p-5 transition hover:border-ember"
            >
              <p className="font-serif text-lg text-foreground">{pkg.name}</p>
              <p className="mt-1 text-xs text-muted">{pkg.desc}</p>
              <p className="mt-3 text-sm font-semibold text-ember">{pkg.price}</p>
              <ul className="mt-3 space-y-1">
                {pkg.items.map((item) => (
                  <li key={item} className="text-xs text-muted">{item}</li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Not sure? Just describe it in the chat — every proposal carries a fixed price you accept before anything is funded.
        </p>
      </div>
    </section>
  );
}
