'use client';
// Minimal markdown for AI text (bold, bullet/numbered lists, paragraphs) —
// enough for Gemini's typical output without pulling in a full markdown lib.

function renderInline(line, keyPrefix) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${i}`}>{part}</span>
  ));
}

export default function Markdown({ text }) {
  if (!text) return null;
  const blocks = [];
  let list = null; // { type: 'ul' | 'ol', items: [] }

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    const idx = blocks.length;
    blocks.push(
      <Tag key={idx} className="md-list">
        {list.items.map((item, i) => <li key={i}>{renderInline(item, `li-${idx}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    const bullet = line.match(/^[-*]\s+(.*)/);
    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    if (bullet) {
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(numbered[1]);
    } else {
      flushList();
      blocks.push(<p key={blocks.length}>{renderInline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flushList();
  return <>{blocks}</>;
}
