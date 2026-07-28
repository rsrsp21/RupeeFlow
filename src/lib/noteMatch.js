// Normalizes free-text expense/income notes so recurring purchases match
// regardless of quantity phrasing — "chicken 300g" and "chicken 300 grams"
// both collapse to "chicken". Used to power note autofill/auto-categorize
// on the client and as few-shot history hints for the AI parsing endpoints.
const UNIT_WORDS = 'g|gm|gms|gram|grams|kg|kgs|kilo|kilos|kilogram|kilograms|mg|ml|mls|' +
  'millilitre|millilitres|milliliter|milliliters|l|ltr|ltrs|litre|litres|liter|liters|' +
  'pc|pcs|piece|pieces|pack|packs|packet|packets|dozen|doz|unit|units|no|nos|qty';
const UNIT_RE = new RegExp(`\\b\\d+(\\.\\d+)?\\s*(${UNIT_WORDS})\\b`, 'gi');
const NUM_RE = /\b\d+(\.\d+)?\b/g;

export function normalizeNote(text) {
  return String(text || '')
    .toLowerCase()
    .replace(UNIT_RE, ' ')
    .replace(NUM_RE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Groups transactions by normalized note, keeping the most recently used
// category/project/account/amount per recurring item so a near-duplicate
// note reuses what was picked last time instead of drifting.
export function buildNoteHistory(transactions) {
  const map = new Map();
  const list = (transactions || [])
    .filter((t) => !t.deleted && t.type !== 'transfer' && t.note && t.note.trim())
    .sort((a, b) => a.occurred_at - b.occurred_at);
  for (const t of list) {
    const key = normalizeNote(t.note);
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      key,
      note: t.note.trim(),
      category: t.category,
      project: t.project || '',
      account: t.account,
      amount: t.amount,
      type: t.type,
      count: (prev?.count || 0) + 1,
      lastUsed: t.occurred_at,
    });
  }
  return [...map.values()].sort((a, b) => b.lastUsed - a.lastUsed);
}
