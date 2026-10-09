'use strict';

// The one slash command BrandForge registers, and the invite link that installs the bot so the
// command shows up under BrandForge in the server's command picker.
//
// `/brandforge` on its own opens the button menu. `/brandforge request:<text>` skips the menu.
// integration_types 0 + 1 and contexts 0/1/2 let it work in servers, in DMs with the bot, and when a
// person adds the app to their own account.
const COMMAND = {
  name: 'brandforge',
  description: 'Open BrandForge: tap a button for a plan, ads, an audit, a calendar, an image or a video',
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    { type: 3, name: 'request', description: 'Skip the menu: say what you want to build or make', required: false, max_length: 1500 },
    {
      type: 3,
      name: 'kind',
      description: 'A shortcut for the request (optional)',
      required: false,
      choices: ['plan', 'ads', 'audit', 'calendar', 'launch', 'image', 'video'].map((value) => ({ name: value, value })),
    },
  ],
};

// The application id is the first segment of the bot token (base64 of the id).
function applicationIdFromToken(token) {
  try {
    return Buffer.from(String(token || '').split('.')[0], 'base64').toString('utf8');
  } catch {
    return '';
  }
}

// View Channels + Send Messages + Embed Links + Attach Files + Read Message History.
const INVITE_PERMISSIONS = 1024 + 2048 + 16384 + 32768 + 65536;

function inviteUrl(applicationId) {
  const id = String(applicationId || '').replace(/\D/g, '');
  if (!id) return '';
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS}`;
}

module.exports = { COMMAND, INVITE_PERMISSIONS, applicationIdFromToken, inviteUrl };
