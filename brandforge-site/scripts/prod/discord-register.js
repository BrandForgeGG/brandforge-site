// Registers the /brandforge slash command for the BrandForge Discord application.
// Usage (token never printed): DISCORD_BOT_TOKEN=... node scripts/prod/discord-register.js
// The admin dashboard has a button that does the same without a terminal.
const { COMMAND, applicationIdFromToken } = require('../../lib/discord-commands.js');
const token = String(process.env.DISCORD_BOT_TOKEN || '').trim();
if (!token) throw new Error('Set DISCORD_BOT_TOKEN');
const appId = applicationIdFromToken(token);

(async () => {
  // PUT replaces the application's global commands with ours, so no stale or duplicate entry remains.
  const response = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
    body: JSON.stringify([COMMAND]),
  });
  console.log(response.status, response.ok ? 'registered /brandforge' : await response.text());
})();
