const MAX_MESSAGE_LENGTH = 8000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain',
  'application/json', 'application/zip', 'text/csv', 'audio/webm', 'audio/ogg',
  'audio/mpeg', 'audio/mp4',
]);

function validateMessageInput(value) {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) return { error: 'Write a message before sending.' };
  if (content.length > MAX_MESSAGE_LENGTH) return { error: `Messages must be 8,000 characters or fewer.` };
  return { value: content };
}

function validateAttachment(file) {
  if (!file || typeof file !== 'object') return { error: 'Choose a file to attach.' };
  if (typeof file.name !== 'string' || !file.name.trim()) return { error: 'That file needs a name.' };
  if (typeof file.type !== 'string' || !ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return { error: 'That file type is not supported. Use an image, PDF, document, archive, CSV, or audio file.' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return { error: 'Attachments must be 10 MB or smaller.' };
  }
  return { file };
}

function normalizeMessageEdit(value) {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content || content.length > 8000) return null;
  return content;
}

function normalizeReactionEmoji(value) {
  const emoji = typeof value === 'string' ? value.trim() : '';
  const characters = [...emoji];
  if (characters.length < 1 || [...emoji].length > 8) return null;
  return emoji;
}

function canMutateMessage(message, userId) {
  return Boolean(
    message &&
    typeof message.id === 'string' &&
    message.id &&
    typeof userId === 'string' &&
    message.sender_id === userId &&
    message.sender_type !== 'ai' &&
    message.content_type !== 'system' &&
    !message.deleted_at
  );
}

function displayAttachmentName(storageName) {
  const decoded = decodeURIComponent(storageName);
  const uuidPrefix = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i;
  return decoded.replace(uuidPrefix, '') || 'attachment';
}

function safeDownloadName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}


function parseSlashCommand(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw.startsWith('/')) return null;
  const [name, ...args] = raw.slice(1).split(/\s+/);
  const command = name.toLowerCase();
  if (!['help', 'progress', 'review', 'attach', 'contract'].includes(command)) return { error: `Unknown command /${name}` };
  return { command, args: args.join(' ').trim() };
}

// A chat action embed is structured metadata attached to a system message. It is never trusted
// blindly: unknown types, missing ids, and non-object payloads resolve to null so the transcript
// falls back to the plain system message instead of rendering a broken card.
function parseChatEmbed(artifactData) {
  if (!artifactData || typeof artifactData !== 'object' || Array.isArray(artifactData)) return null;
  const type = typeof artifactData.type === 'string' ? artifactData.type : '';
  const id = typeof artifactData.id === 'string' ? artifactData.id : '';
  const status = typeof artifactData.status === 'string' ? artifactData.status : '';

  if (type === 'proposal' && id) {
    const title = typeof artifactData.title === 'string' ? artifactData.title : undefined;
    // Priced-offer snapshot (written by the proposals route): each card carries its own
    // facts so an old card keeps showing what was offered even after later counters move
    // the row on. Anything absent falls back to the message text in the transcript.
    const num = (value) => (Number.isFinite(value) ? value : undefined);
    const str = (value, max) => (typeof value === 'string' && value ? value.slice(0, max) : undefined);
    const totalAmount = num(artifactData.totalAmount);
    const currency = str(artifactData.currency, 8);
    const weeksMin = num(artifactData.weeksMin);
    const weeksMax = num(artifactData.weeksMax);
    const scope = str(artifactData.scope, 4000);
    const counterTotalAmount = num(artifactData.counterTotalAmount);
    const counterWeeksMin = num(artifactData.counterWeeksMin);
    const counterWeeksMax = num(artifactData.counterWeeksMax);
    const counterNote = str(artifactData.counterNote, 1000);
    const counterRound =
      artifactData.counterRound === 1 || artifactData.counterRound === 2
        ? artifactData.counterRound
        : undefined;
    return {
      type,
      proposalId: id,
      status,
      ...(title ? { title } : {}),
      ...(totalAmount !== undefined ? { totalAmount } : {}),
      ...(currency ? { currency } : {}),
      ...(weeksMin !== undefined ? { weeksMin } : {}),
      ...(weeksMax !== undefined ? { weeksMax } : {}),
      ...(scope ? { scope } : {}),
      ...(counterTotalAmount !== undefined ? { counterTotalAmount } : {}),
      ...(counterWeeksMin !== undefined ? { counterWeeksMin } : {}),
      ...(counterWeeksMax !== undefined ? { counterWeeksMax } : {}),
      ...(counterNote ? { counterNote } : {}),
      ...(counterRound !== undefined ? { counterRound } : {}),
    };
  }
  if (type === 'agreement' && id) return { type, agreementId: id, status };
  if (type === 'funding' && id) {
    const paymentId = typeof artifactData.paymentId === 'string' ? artifactData.paymentId : undefined;
    return { type, agreementId: id, status, ...(paymentId ? { paymentId } : {}) };
  }
  if (type === 'review_request' && id) {
    // Snapshot of the brief at handoff: percent is the discovery completeness, complete marks a
    // fully-shaped brief. Older rows lack both — the card falls back to the message text.
    const percent = Number.isFinite(artifactData.percent) ? Number(artifactData.percent) : undefined;
    const complete = typeof artifactData.complete === 'boolean' ? artifactData.complete : undefined;
    return { type, conversationId: id, ...(percent !== undefined ? { percent } : {}), ...(complete !== undefined ? { complete } : {}) };
  }
  return null;
}

// Composer command chips must never destroy what the user already typed.
function insertComposerCommand(current, command) {
  const text = typeof current === 'string' ? current.replace(/\s+$/, '') : '';
  return text ? `${text} ${command} ` : `${command} `;
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_TYPES,
  validateMessageInput,
  validateAttachment,
  normalizeMessageEdit,
  normalizeReactionEmoji,
  canMutateMessage,
  displayAttachmentName,
  safeDownloadName,
  parseSlashCommand,
  parseChatEmbed,
  insertComposerCommand,
};

