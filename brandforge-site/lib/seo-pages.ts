// What each public page says about itself to search engines and AI assistants: its own keywords, and a description that
// ends with the one thing the page wants the reader to do (the CTA). Descriptions are kept near 155 characters so they
// are not cut in results. Everything stated here is true of the page today.
export type PageCopy = { title?: string; description: string; keywords: string[]; cta: string };

export const PAGE_COPY: Record<string, PageCopy> = {
  '/': {
    description: 'Make carousels, ads and a week of posts with AI, trade services, and hire the BrandForge team. Free to start. Describe your idea and begin.',
    keywords: ['AI and people workspace', 'AI content maker', 'carousel maker', 'social media post generator', 'hire a marketing team', 'freelance marketplace with escrow'],
    cta: 'Start free',
  },
  '/features': {
    title: 'Features: AI chat, makers, marketplace and team',
    description: 'A chat that does the work, makers for carousels, ads and polls, a week of posts, a marketplace and a team to finish the job. See every feature.',
    keywords: ['BrandForge features', 'AI chat workspace', 'carousel and ad maker', 'content calendar', 'AI post scheduler', 'milestone contracts'],
    cta: 'See every feature',
  },
  '/pricing': {
    description: 'The tools are free. The BrandForge team starts at €690 a month, or hire one project at a fixed price. Compare plans and pick yours.',
    keywords: ['BrandForge pricing', 'marketing retainer', 'content team subscription', 'fixed price web design', 'hire designers monthly'],
    cta: 'Compare plans',
  },
  '/create': {
    title: 'Create: free carousel, ad and poll maker',
    description: 'Turn one sentence into a carousel, ad, quote, tip, announcement or poll, then download it. Free to make. Make your first one now.',
    keywords: ['carousel maker', 'free ad maker', 'quote post maker', 'poll maker', 'social media graphics generator', 'Instagram carousel generator'],
    cta: 'Make your first one',
  },
  '/distribute': {
    title: 'Distribute: a week of social posts, scheduled for you',
    description: 'Say what you promote and get a week of posts: pictures, captions and times. Post or schedule them to your channels. Write your week.',
    keywords: ['social media content calendar', 'AI post scheduler', 'weekly content plan generator', 'schedule posts to Telegram Discord Bluesky Mastodon', 'content planner'],
    cta: 'Write your week',
  },
  '/trade': {
    title: 'Trade: hire freelancers or get hired, with escrow',
    description: 'Hire, or get hired. List a gig, product, tool or request, agree terms in a private chat and sign a milestone contract. Post your first listing.',
    keywords: ['freelance marketplace', 'hire freelancers', 'sell digital services', 'milestone contracts', 'escrow marketplace', 'post a gig'],
    cta: 'Post your first listing',
  },
  '/platform': {
    title: 'How it works: brief, proposal, escrow, delivery',
    description: 'How a BrandForge project runs: brief, priced proposal, contract, verified escrow and milestone payments. See each step before you start.',
    keywords: ['how BrandForge works', 'project brief to delivery', 'escrow milestone payments', 'fixed price proposal', 'hire a dev team with escrow'],
    cta: 'See each step',
  },
  '/enterprise': {
    description: 'A named lead, a small team, fixed prices and escrow for bigger builds and retainers. Describe your project and get a proposal.',
    keywords: ['hire a development team', 'fixed price software project', 'agency alternative', 'web app development', 'retainer for design and development'],
    cta: 'Get a proposal',
  },
  '/work': {
    title: 'Work: live projects built by BrandForge',
    description: 'Real sites and apps the BrandForge team shipped, all live. Open any of them and judge the work. Browse the projects.',
    keywords: ['BrandForge portfolio', 'web development portfolio', 'SaaS projects shipped', 'case studies', 'client work'],
    cta: 'Browse the projects',
  },
  '/specialists': {
    title: 'The BrandForge team: the people behind your plan',
    description: 'Designers, editors, developers and marketers who ship your content, ads and site updates every month, each reviewed by a person. Meet the team.',
    keywords: ['vetted freelancers', 'BrandForge team', 'hire designers and developers', 'specialist marketplace', 'trusted freelancers'],
    cta: 'Meet the team',
  },
  '/blog': {
    title: 'Blog: BrandForge product updates and shipping notes',
    description: 'Dated product updates and shipping notes from the BrandForge team: what we built, why, and what is next. Read the latest.',
    keywords: ['BrandForge blog', 'product updates', 'changelog', 'building in public', 'AI workspace news'],
    cta: 'Read the latest',
  },
  '/explore': {
    title: 'Explore: where BrandForge is going',
    description: 'Where BrandForge is going, what members are making and listing right now, and what is live, being built and needed next. See the roadmap.',
    keywords: ['BrandForge roadmap', 'what is new on BrandForge', 'BrandForge community activity', 'product roadmap'],
    cta: 'See the roadmap',
  },
  '/about': {
    title: 'About BrandForge: AI and people, on the same page',
    description: 'AI makes the first version in seconds; a team of designers, editors, developers and marketers ships it every month. Learn what we do.',
    keywords: ['about BrandForge', 'AI and people', 'who runs BrandForge', 'BrandForge mission'],
    cta: 'Learn what we do',
  },
  '/developers': {
    description: 'Join the BrandForge team as a developer or designer. Real briefs, scoped up front, paid per milestone through escrow. Apply to build with us.',
    keywords: ['freelance developer jobs', 'remote designer jobs', 'paid per milestone', 'join a dev team', 'work with escrow protection'],
    cta: 'Apply to build with us',
  },
  '/investors': {
    description: 'What BrandForge is, what is live today, how it earns and where it goes next. An early company that ships weekly. Talk to the founder.',
    keywords: ['BrandForge investors', 'early stage startup', 'AI marketplace startup', 'pre-seed AI workspace'],
    cta: 'Talk to the founder',
  },
  '/careers': {
    title: 'Careers at BrandForge: a small team shipping in public',
    description: 'A small team shipping in the open. See how we work and what we are hiring for, then say hello.',
    keywords: ['BrandForge careers', 'remote startup jobs', 'small team hiring', 'work in public'],
    cta: 'Say hello',
  },
  '/apply': {
    title: 'Apply to join the BrandForge team',
    description: 'Developers, designers, marketers and writers: apply to work on real briefs, get paid per milestone through escrow. Send your application.',
    keywords: ['apply to join BrandForge', 'freelance marketing jobs', 'freelance writer jobs', 'paid per milestone'],
    cta: 'Send your application',
  },
  '/terms': {
    description: 'The terms for projects, verified crypto escrow and milestone releases on BrandForge. Read before you fund a project.',
    keywords: ['BrandForge terms of service', 'escrow terms'],
    cta: 'Read before you fund',
  },
  '/privacy': {
    description: 'What data BrandForge collects, who can see it, how cookies work and how to delete it. Read the policy or manage your cookies.',
    keywords: ['BrandForge privacy policy', 'cookie policy', 'data deletion'],
    cta: 'Manage your cookies',
  },
  '/refunds': {
    description: 'How refunds work for projects funded through verified escrow, before and after work begins. Read the refund policy.',
    keywords: ['BrandForge refund policy', 'escrow refunds'],
    cta: 'Read the refund policy',
  },
  '/data-deletion': {
    description: 'How to disconnect a social account from BrandForge and delete the data we hold. Follow the steps to remove your data.',
    keywords: ['delete my data', 'disconnect social account', 'BrandForge data deletion'],
    cta: 'Remove your data',
  },
};

export function pageCopy(path: string): PageCopy | undefined {
  return PAGE_COPY[path];
}
