import DOMPurify from 'isomorphic-dompurify';
import { parseFragment } from 'parse5';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'u',
  'a',
  'ul',
  'li',
  'h1',
  'h2',
  'h3',
  'span',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
];

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
};

// The plain text a reviewer sees for a post item: the text nodes of the
// sanitised HTML, in order, entities decoded. This is what anchor offsets
// index into on both the frontend (element.textContent) and the backend.
export const postContentPlainText = (value: unknown): string => {
  const walk = (nodes: any[]): string =>
    nodes
      .map((node) =>
        node.nodeName === '#text' ? node.value : walk(node.childNodes || [])
      )
      .join('');

  return walk(parseFragment(sanitizePostContent(value)).childNodes as any[]);
};

export const plainTextToPostHtml = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(
      (line) =>
        `<p>${line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')}</p>`
    )
    .join('');
