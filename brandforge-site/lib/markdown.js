// A small, safe Markdown parser for chat content.
//
// Safety rules:
// - The parser NEVER produces HTML. Output is a token tree; React renders text nodes,
//   so raw markup in a model or user message is displayed literally, never executed.
// - Links are only recognized for http(s) and site-relative targets. Anything else
//   (javascript:, data:, unparseable) is rendered as plain text.
// - Supported on purpose: headings, paragraphs, bold, italic, inline code, fenced code
//   blocks, ordered/unordered lists, blockquotes, horizontal rules, links.
// - Not supported (renders as literal text): raw HTML, images, tables, reference links.

const SAFE_LINK = /^(https?:\/\/|\/)/i;

function parseInlines(text) {
  const out = [];
  const source = String(text ?? '');
  const pattern = /(`+)([^`]+?)\1|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)\s]+)\)/g;

  let cursor = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) {
      out.push({ type: 'text', text: source.slice(cursor, match.index) });
    }

    if (match[2] !== undefined) {
      out.push({ type: 'code', text: match[2] });
    } else if (match[3] !== undefined) {
      out.push({ type: 'strong', text: match[3] });
    } else if (match[4] !== undefined) {
      out.push({ type: 'em', text: match[4] });
    } else if (match[5] !== undefined) {
      out.push({ type: 'em', text: match[5] });
    } else if (match[6] !== undefined) {
      const href = match[7];
      if (SAFE_LINK.test(href)) {
        out.push({ type: 'link', text: match[6], href });
      } else {
        // Unsafe scheme: keep the original literal text, never a clickable link.
        out.push({ type: 'text', text: match[0] });
      }
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    out.push({ type: 'text', text: source.slice(cursor) });
  }

  return out;
}

// A pipe table is a header row followed by a separator row such as | --- | :---: |.
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  // Manual split: an escaped pipe (\|) stays inside its cell. No regex lookbehind, which older
  // Safari versions reject at parse time and would take the whole chat bundle down with it.
  const cells = [];
  let current = '';
  for (let position = 0; position < row.length; position += 1) {
    const char = row[position];
    if (char === '\\' && row[position + 1] === '|') {
      current += '|';
      position += 1;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableStart(lines, index) {
  const header = lines[index] ?? '';
  const separator = lines[index + 1] ?? '';
  if (!header.includes('|') || !TABLE_SEPARATOR.test(separator) || !separator.includes('-')) return false;
  const columns = splitRow(header).length;
  return columns >= 2 && splitRow(separator).length === columns;
}

function startsBlock(lines, index) {
  const line = lines[index] ?? '';
  return (
    line.trim() === '' ||
    /^```/.test(line) ||
    /^(#{1,4})\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^(\s*)([-*+]|\d+[.)])\s+/.test(line) ||
    /^(-{3,}|\*{3,})$/.test(line.trim()) ||
    isTableStart(lines, index)
  );
}

const MAX_TABLE_ROWS = 200;

function parseMarkdown(source) {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const tokens = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    // Fenced code block: content is preserved verbatim, including HTML and backticks.
    const fence = line.match(/^(`{3,})\s*(\S*)/);
    if (fence) {
      const marker = fence[1];
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(marker)) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1; // closing fence (or EOF)
      tokens.push({ type: 'code', lang: fence[2] || '', code: body.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      tokens.push({ type: 'heading', depth: heading[1].length, inlines: parseInlines(heading[2]) });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      tokens.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      tokens.push({ type: 'quote', inlines: parseInlines(quoted.join(' ')) });
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitRow(line).map((cell) => parseInlines(cell));
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '' && rows.length < MAX_TABLE_ROWS) {
        const cells = splitRow(lines[index]);
        // Ragged rows are padded or trimmed to the header width so the grid stays rectangular.
        const fitted = Array.from({ length: header.length }, (_, column) => parseInlines(cells[column] ?? ''));
        rows.push(fitted);
        index += 1;
      }
      tokens.push({ type: 'table', header, rows });
      continue;
    }

    const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      const ordered = /\d/.test(listItem[2]);
      const items = [];
      while (index < lines.length) {
        const current = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (current && /\d/.test(current[2]) === ordered) {
          items.push([current[3]]);
          index += 1;
          continue;
        }
        // Indented continuation line belongs to the previous item.
        if (items.length > 0 && /^\s+\S/.test(lines[index]) && !startsBlock(lines, index)) {
          items[items.length - 1].push(lines[index].trim());
          index += 1;
          continue;
        }
        break;
      }
      tokens.push({
        type: 'list',
        ordered,
        items: items.map((parts) => parseInlines(parts.join(' '))),
      });
      continue;
    }

    // Paragraph: consecutive plain lines, soft-broken with spaces.
    const paragraph = [line];
    index += 1;
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    tokens.push({ type: 'paragraph', inlines: parseInlines(paragraph.join(' ')) });
  }

  return tokens;
}

module.exports = { parseMarkdown, parseInlines };
