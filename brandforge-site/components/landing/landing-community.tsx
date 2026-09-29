import { COMMUNITY_LINKS } from '@/lib/community';

const TELEGRAM_CHANNELS = [
  COMMUNITY_LINKS.telegramChannel,
  COMMUNITY_LINKS.telegramGroup,
  {
    ...COMMUNITY_LINKS.telegramManager,
    label: `Project manager (${COMMUNITY_LINKS.telegramManager.handle})`,
  },
];

export function LandingCommunity() {
  return (
    <>
        <section id="community" className="bf-section">
        <div className="bf-container">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Get in early</p>
          <h2 className="mt-2 font-serif text-3xl text-[#ece7de] sm:text-4xl">
            The app is live. The community is where builds land first.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#9aa0a6]">
            Watch us ship, talk to the crew, or bring your project today. A human answers.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <a
              href={COMMUNITY_LINKS.discord.href}
              target="_blank"
              rel="noreferrer"
              className="bf-community-card bf-community-card-featured"
            >
              <p className="font-serif text-xl text-[#ece7de]">Discord</p>
              <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">
                {COMMUNITY_LINKS.discord.description}
              </p>
              <p className="mt-4 text-sm font-semibold text-[#e8571e]">
                {COMMUNITY_LINKS.discord.href.replace('https://', '')}
              </p>
            </a>

            <div className="bf-community-card">
              <p className="font-serif text-xl text-[#ece7de]">Telegram</p>
              <div className="mt-3 space-y-3">
                {TELEGRAM_CHANNELS.map((channel) => (
                  <a
                    key={channel.href}
                    href={channel.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-[#ece7de]">{channel.label}</span>
                    <span className="text-[#9aa0a6] transition group-hover:text-[#e8571e]">Open</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
