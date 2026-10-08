// Registers the /brandforge slash command for the BrandForge Discord application.
// Usage (token never printed): DISCORD_BOT_TOKEN=... node scripts/prod/discord-register.js
// The application id is the first segment of the bot token (base64 of the bot's id).
const token = String(process.env.DISCORD_BOT_TOKEN || '').trim();
if (!token) throw new Error('Set DISCORD_BOT_TOKEN');
const appId = Buffer.from(token.split('.')[0], 'base64').toString('utf8');

const command = {
  name: 'brandforge',
  description: 'Ask BrandForge: a plan, ads, an audit, a calendar, an image or a video',
  options: [
    { type: 3, name: 'request', description: 'What you want to build or make', required: true },
    {
      type: 3,
      name: 'kind',
      description: 'A shortcut (optional)',
      required: false,
      choices: ['plan', 'ads', 'audit', 'calendar', 'launch', 'image', 'video'].map((value) => ({ name: value, value })),
    },
  ],
};

(async () => {
  const response = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
    body: JSON.stringify(command),
  });
  console.log(response.status, response.ok ? 'registered /brandforge' : await response.text());
})();
