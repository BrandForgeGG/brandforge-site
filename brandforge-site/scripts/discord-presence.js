// Keeps the BrandForge Discord bot showing as ONLINE.
//
// Why this exists: a Discord bot is "online" only while something holds a live connection to
// Discord's gateway. The website runs on serverless functions that cannot, so slash commands, buttons
// and forms work without it, but the bot would always look offline. This script holds that
// connection. It does nothing else: no intents, no messages read, nothing sent.
//
// Run it on any always-on machine (a small VPS, a Raspberry Pi, Railway, Fly.io, a home server):
//
//   DISCORD_BOT_TOKEN=your-token node scripts/discord-presence.js
//
// Needs Node 22 or newer (built-in WebSocket). Keep it running with pm2, systemd or a Docker
// restart policy. The token is read from the environment and never printed.
const token = String(process.env.DISCORD_BOT_TOKEN || '').trim();
if (!token) {
  console.error('Set DISCORD_BOT_TOKEN');
  process.exit(1);
}
if (typeof WebSocket === 'undefined') {
  console.error('This needs Node 22 or newer (global WebSocket).');
  process.exit(1);
}

const STATUS_TEXT = process.env.DISCORD_STATUS_TEXT || 'ideas become projects: brandforge.gg';
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

let socket = null;
let heartbeat = null;
let sequence = null;
let sessionId = null;
let resumeUrl = null;
let ackReceived = true;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function send(payload) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function identify() {
  send({
    op: 2,
    d: {
      token,
      intents: 0,
      properties: { os: process.platform, browser: 'brandforge-presence', device: 'brandforge-presence' },
      presence: { status: 'online', afk: false, since: null, activities: [{ name: STATUS_TEXT, type: 3 }] },
    },
  });
}

function resume() {
  send({ op: 6, d: { token, session_id: sessionId, seq: sequence } });
}

function stopHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

function connect(url = GATEWAY) {
  stopHeartbeat();
  socket = new WebSocket(url);

  socket.addEventListener('message', (event) => {
    let packet;
    try {
      packet = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (packet.s !== null && packet.s !== undefined) sequence = packet.s;

    switch (packet.op) {
      case 10: {
        const interval = packet.d.heartbeat_interval;
        ackReceived = true;
        stopHeartbeat();
        // First beat after a random fraction of the interval, as Discord asks, then steady.
        setTimeout(() => {
          send({ op: 1, d: sequence });
          heartbeat = setInterval(() => {
            if (!ackReceived) {
              log('No heartbeat ack, reconnecting');
              socket.close(4000);
              return;
            }
            ackReceived = false;
            send({ op: 1, d: sequence });
          }, interval);
        }, Math.floor(interval * Math.random()));
        if (sessionId) resume();
        else identify();
        break;
      }
      case 11:
        ackReceived = true;
        break;
      case 1:
        send({ op: 1, d: sequence });
        break;
      case 7:
        log('Discord asked us to reconnect');
        socket.close(4000);
        break;
      case 9:
        log('Session invalid, starting fresh');
        if (!packet.d) {
          sessionId = null;
          sequence = null;
          resumeUrl = null;
        }
        setTimeout(() => (sessionId ? resume() : identify()), 1000 + Math.random() * 4000);
        break;
      case 0:
        if (packet.t === 'READY') {
          sessionId = packet.d.session_id;
          resumeUrl = packet.d.resume_gateway_url ? `${packet.d.resume_gateway_url}/?v=10&encoding=json` : null;
          log(`Online as ${packet.d.user && packet.d.user.username ? packet.d.user.username : 'the bot'}`);
        }
        break;
      default:
        break;
    }
  });

  socket.addEventListener('close', (event) => {
    stopHeartbeat();
    // 4004 = bad token, 4013/4014 = intents not allowed: retrying cannot fix those.
    if (event.code === 4004) {
      log('Discord rejected the token (4004). Paste a fresh one and restart.');
      process.exit(1);
    }
    log(`Connection closed (${event.code}), reconnecting in 5s`);
    setTimeout(() => connect(sessionId && resumeUrl ? resumeUrl : GATEWAY), 5000);
  });

  socket.addEventListener('error', () => {
    /* the close handler reconnects */
  });
}

log('Connecting to the Discord gateway');
connect();
