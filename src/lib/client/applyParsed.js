import { CATEGORIES } from './constants';

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
      category: CATEGORIES[e.category] ? e.category : 'Other',
      note: String(e.note || '').slice(0, 200),
      project: String(e.project || '').slice(0, 60),
      account: 'Cash', to_account: '',
      occurred_at: occurred,
      created_at: Date.now(), updated_at: Date.now(), rev: 1, deleted: 0, source,
    });
    added++; sum += amount;
  }
  return { added, sum };
}
