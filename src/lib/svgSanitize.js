// Strict allowlist sanitizer for the one place this app ever renders markup
// it didn't write itself: an AI-generated category icon (see
// gemini.js#categoryIcon). Runs server-side before anything is ever stored,
// and again client-side before render — no DOM/XML parser is available in
// the serverless runtime, so this is a conservative tag/attribute allowlist
// rather than a real parse. Reject-on-anything-unexpected, not best-effort.
const ALLOWED_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'ellipse', 'polygon', 'polyline', 'g']);
const ALLOWED_ATTRS = new Set([
  'xmlns', 'viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
]);
// Anything matching this is an instant reject, regardless of tag/attr checks —
// belt-and-suspenders against scripts, external refs, or CSS-based tricks.
const BLOCKLIST_RE = /<script|<foreignobject|<image|<style|<iframe|<embed|<object|javascript:|data:text\/html|on[a-z]+\s*=|xlink:href|href\s*=/i;

export function sanitizeSvg(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('<svg') || !s.endsWith('</svg>') || s.length > 4000) return null;
  if (BLOCKLIST_RE.test(s)) return null;

  const tags = [...s.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase());
  if (!tags.length || tags.some((t) => !ALLOWED_TAGS.has(t))) return null;

  const attrs = [...s.matchAll(/([a-zA-Z:-]+)\s*=\s*"[^"]*"/g)].map((m) => m[1].toLowerCase());
  if (attrs.some((a) => !ALLOWED_ATTRS.has(a))) return null;

  return s;
}
