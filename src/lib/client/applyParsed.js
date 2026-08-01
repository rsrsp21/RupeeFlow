import { CATEGORIES } from './constants';

// Gemini is told to reuse an existing category (built-in or this user's own
// custom ones) whenever one genuinely fits, and only propose a new name when
// none do — so anything that comes back not already known is a deliberate
// "nothing fit" signal, not a hallucination to shrug off into "Other". Create
// it (this also generates its icon) so voice/text/receipt entries can end up
// in a fresh category exactly like typing one manually would.
export async function resolveCategory(store, name) {
  const clean = String(name || '').trim();
  if (!clean) return 'Other';
  if (CATEGORIES[clean]) return clean;
  const existing = store.customCategories.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.name;
  try {
    const saved = await store.addCustomCategory(clean);
    return saved.name;
  } catch {
    return 'Other';
  }
}

// Shared by voice and text quick-add: both hit Gemini endpoints returning the
// same {transactions:[...]} shape (see entrySchema() in lib/gemini.js).
export async function applyParsedTransactions(store, out, source) {
  const entries = out?.transactions || [];
  if (!entries.length) return { added: 0, sum: 0 };
  let added = 0, sum = 0;
  for (const e of entries) {
    const amount = Math.round((Number(e.amount_rupees) || 0) * 100);
    if (amount <= 0) continue;
    // spoken/written dates ("on 26th July", "yesterday") come back as YYYY-MM-DD
    let occurred = Date.now();
    if (e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      const t = new Date(e.date + 'T12:00:00').getTime();
      if (Number.isFinite(t)) occurred = t;
    } else if (e.occurred_at_offset_days) {
      occurred += (Number(e.occurred_at_offset_days) || 0) * 86400000;
    }
    await store.saveTx({
      id: crypto.randomUUID(),
      type: ['expense', 'income', 'transfer'].includes(e.type) ? e.type : 'expense',
      amount,
      category: await resolveCategory(store, e.category),
      note: String(e.note || '').slice(0, 200),
      // The user's own first account, not a hardcoded 'Cash' — someone whose
      // accounts are, say, "SBI"/"HDFC" was getting every voice/text entry
      // filed under a "Cash" account that doesn't exist for them. It stayed
      // invisible in the Accounts list while still counting toward the
      // overall net balance, which is money you can't see or manage.
      account: store.accounts[0]?.name || 'Cash', to_account: '',
      occurred_at: occurred,
      created_at: Date.now(), updated_at: Date.now(), rev: 1, deleted: 0, source,
    });
    added++; sum += amount;
  }
  return { added, sum };
}
