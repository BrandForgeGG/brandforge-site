// Builds the file-context block appended to the AI system prompt.
//
// Honesty rules:
// - Only genuinely readable text formats (plain text, CSV, JSON) have their content
//   embedded. PDFs, images, audio and archives are LISTED by name/type/size only -
//   we never pretend to have read a binary file, and we never invent page numbers.
// - Budgets are enforced per file and in total so a turn cannot blow the prompt.

const READABLE_TYPES = new Set(['text/plain', 'text/csv', 'application/json']);

const MAX_FILE_CHARS = 20000;
const MAX_TOTAL_CHARS = 60000;
const MAX_NAME_CHARS = 120;
const MAX_LISTED_FILES = 10;

function isDirectlyReadable(contentType) {
  return READABLE_TYPES.has(String(contentType ?? '').toLowerCase());
}

function formatBytes(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeName(name) {
  const trimmed = String(name ?? '').trim().slice(0, MAX_NAME_CHARS);
  return trimmed || 'attachment';
}

// Fenced block whose fence is longer than any backtick run inside the content,
// so code samples in a file cannot break out of the block.
function fenced(content) {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${content}\n${fence}`;
}

/**
 * @param {Array<{name?: string, contentType?: string, size?: number, text?: string|null}>} items
 * @returns {string} the block to append to the system prompt, or '' when there are no files.
 */
function buildFileContextBlock(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const listed = items.slice(0, MAX_LISTED_FILES);
  const lines = ['PROJECT FILES IN THIS CONVERSATION'];
  let budget = MAX_TOTAL_CHARS;
  const sections = [];

  for (const item of listed) {
    const name = safeName(item?.name);
    const contentType = String(item?.contentType ?? 'application/octet-stream');
    const header = `- ${name} (${contentType}, ${formatBytes(item?.size)})`;

    if (!isDirectlyReadable(contentType)) {
      lines.push(`${header} — listed only; contents not loaded (binary format)`);
      continue;
    }

    const raw = typeof item?.text === 'string' ? item.text : null;
    if (raw === null) {
      lines.push(`${header} — content not loaded this turn`);
      continue;
    }

    if (budget <= 0) {
      lines.push(`${header} — content skipped (context budget reached)`);
      continue;
    }

    const clip = raw.slice(0, Math.min(MAX_FILE_CHARS, budget));
    budget -= clip.length;
    const truncated = clip.length < raw.length;
    lines.push(`${header} — full content ${truncated ? 'truncated to the first ' + clip.length + ' characters' : 'included below'}`);
    sections.push(fenced(clip));
  }

  if (items.length > listed.length) {
    lines.push(`(${items.length - listed.length} more file(s) not listed)`);
  }

  if (sections.length === 0) {
    return lines.join('\n');
  }

  return `${lines.join('\n')}\n${sections.join('\n')}`;
}

module.exports = {
  READABLE_TYPES,
  MAX_FILE_CHARS,
  MAX_TOTAL_CHARS,
  isDirectlyReadable,
  formatBytes,
  buildFileContextBlock,
};
