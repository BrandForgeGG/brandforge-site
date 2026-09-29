'use client';

import { useMemo, useState } from 'react';
import { parseMarkdown, type MarkdownInline, type MarkdownToken } from '@/lib/markdown';

// Renders the safe token tree from lib/markdown.js as React elements. Text nodes are
// escaped by React, so raw HTML inside a message is shown literally, never executed.
// No dangerouslySetInnerHTML anywhere in this file.

function renderInlines(inlines: MarkdownInline[], keyPrefix: string) {
  return inlines.map((inline, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (inline.type) {
      case 'strong':
        return <strong key={key}>{inline.text}</strong>;
      case 'em':
        return <em key={key}>{inline.text}</em>;
      case 'code':
        return (
          <code key={key} className="bf-inline-code">
            {inline.text}
          </code>
        );
      case 'link':
        return (
          <a key={key} href={inline.href} target="_blank" rel="noopener noreferrer" className="bf-msg-link">
            {inline.text}
          </a>
        );
      default:
        return <span key={key}>{inline.text}</span>;
    }
  });
}

const HEADING_TAGS = ['h3', 'h4', 'h5', 'h6'] as const;

// Fenced code with a copy button: AI answers carry buildable code, and selecting it
// by hand inside a scrollable block is friction nobody needs.
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bf-code-wrap">
      <button
        type="button"
        aria-label="Copy code block"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="bf-code-copy"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="bf-code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderToken(token: MarkdownToken, index: number) {
  switch (token.type) {
    case 'heading': {
      const Tag = HEADING_TAGS[Math.min(token.depth, 4) - 1] ?? 'h6';
      return <Tag key={index}>{renderInlines(token.inlines, `h${index}`)}</Tag>;
    }
    case 'paragraph':
      return <p key={index}>{renderInlines(token.inlines, `p${index}`)}</p>;
    case 'quote':
      return <blockquote key={index}>{renderInlines(token.inlines, `q${index}`)}</blockquote>;
    case 'list': {
      const ListTag = token.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={index}>
          {token.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{renderInlines(item, `li${index}-${itemIndex}`)}</li>
          ))}
        </ListTag>
      );
    }
    case 'code':
      return <CodeBlock key={index} code={token.code} />;
    case 'hr':
      return <hr key={index} />;
    default:
      return null;
  }
}

export function RichContent({ content }: { content: string }) {
  const tokens = useMemo(() => parseMarkdown(content), [content]);
  return <div className="bf-msg-prose">{tokens.map((token, index) => renderToken(token, index))}</div>;
}
