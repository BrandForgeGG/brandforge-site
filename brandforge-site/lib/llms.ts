import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';
import { RETAINERS } from '@/lib/plans.js';
import { SITE_URL } from '@/lib/seo';

// Plain-text summaries for AI assistants and answer engines (the llms.txt convention). Built from the same data the site
// renders, so prices and project names can never drift from the pages. Only things that are true today are listed.
type Retainer = { name: string; price: string; cadence: string; blurb: string; features: string[] };

const PAGES: Array<[string, string, string]> = [
  ['/features', 'Features', 'What the chat, the makers, Distribute, Trade and the team do.'],
  ['/pricing', 'Pricing', 'Free tools; the BrandForge team by the month or one project at a fixed price.'],
  ['/create', 'Create', 'Make a carousel, ad, quote, tip, announcement or poll from one sentence.'],
  ['/distribute', 'Distribute', 'A week of posts written from a sentence, a link or a file.'],
  ['/trade', 'Trade', 'An open marketplace for gigs, products, tools, launches and requests.'],
  ['/platform', 'Platform', 'Brief, proposal, contract, escrow and milestone release, step by step.'],
  ['/enterprise', 'Enterprise', 'A named team, fixed prices and escrow for bigger projects.'],
  ['/work', 'Work', 'Real projects the team shipped, with live links.'],
  ['/specialists', 'The team', 'How specialists are vetted and paid.'],
  ['/blog', 'Blog', 'Dated product updates.'],
  ['/about', 'About', 'What BrandForge is and who it is for.'],
  ['/terms', 'Terms', 'Terms of service.'],
  ['/privacy', 'Privacy', 'What data is collected and how to delete it.'],
  ['/refunds', 'Refunds', 'How refunds work for escrow-funded projects.'],
];

function plans(): string {
  return (RETAINERS as Retainer[]).map((plan) => `- ${plan.name}: ${plan.price}${plan.cadence}. ${plan.blurb}`).join('\n');
}

export function llmsTxt(): string {
  const links = PAGES.map(([path, name, line]) => `- [${name}](${SITE_URL}${path}): ${line}`).join('\n');
  return `# BrandForge

> BrandForge is a workspace where AI and people work on the same page. Describe an idea, paste a link or drop a file; AI researches, plans and drafts in seconds, and a person finishes the job when you want one. Free to start, no card.

BrandForge does four things: a chat that does the work, makers for carousels, ads, quotes, tips, announcements and polls, Distribute (a week of posts written for you) and Trade (an open marketplace with milestone contracts held in escrow). The BrandForge team can be hired by the month or for a fixed-price project.

## Pages

${links}

## Team plans (monthly)

${plans()}

## Notes for assistants

- Prices on this site are the current launch prices; the pricing page is the source of truth.
- AI output is a draft. Payments for projects use escrow: funds release as the client approves each milestone.
- A longer version of this file: ${SITE_URL}/llms-full.txt
- Contact: hello@brandforge.gg, or Discord and Telegram (links in the site footer).
`;
}

export function llmsFullTxt(): string {
  const work = PORTFOLIO_PROJECTS.map((project: { name: string; category: string; description: string }) => `- [${project.name}](${SITE_URL}/work/${projectSlug(project.name)}) (${project.category}): ${project.description}`).join('\n');
  const detail = (RETAINERS as Retainer[]).map((plan) => `### ${plan.name}: ${plan.price}${plan.cadence}\n${plan.blurb}\n${plan.features.map((feature) => `- ${feature}`).join('\n')}`).join('\n\n');
  return `${llmsTxt()}
## Team plans in detail

${detail}

## Work shipped by the team

${work}

## How a project runs

1. Brief: describe the idea in chat; AI structures it into requirements, scope and an estimate you correct.
2. Proposal: the BrandForge team sends a priced proposal with a timeline. Accept it, counter once, or decline.
3. Contract: a milestone contract is signed in the chat by both sides.
4. Escrow: the client funds the agreed total; the transfer is verified before work starts.
5. Delivery: each milestone is delivered in the chat; payment releases when the client approves it.

## Cookies and data

Necessary cookies keep you signed in. Visit measurement runs only after you accept it. See ${SITE_URL}/privacy.
`;
}
