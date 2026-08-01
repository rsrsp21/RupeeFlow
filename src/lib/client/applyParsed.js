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

// Gemini returns type "invest" with a destination holding. Same reasoning as
// resolveCategory: it's told to reuse an existing holding whenever one fits,
// so a name it hasn't seen means none did — create it rather than silently
// booking a SIP as an expense.
export async function resolveHolding(store, name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const existing = store.holdings.find((h) => h.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.name;
  // Guess the kind from the name so the icon isn't always the generic one.
  const kind = /mutual|sip|fund|nifty|index/i.test(clean) ? 'Mutual Funds'
    : /stock|share|equity|demat/i.test(clean) ? 'Stocks'
    : /\bfd\b|fixed deposit|\brd\b|recurring/i.test(clean) ? 'FD'
    : /home|house|cash at home/i.test(clean) ? 'Home'
    : 'Other';
  try {
    await store.saveHoldings([...store.holdings, { name: clean, kind, opening_balance: 0 }]);
    return clean;
  } catch {
    return '';
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
    // An investment is stored as a transfer into a holding (the transactions
    // table only allows expense/income/transfer) — so it leaves the account
    // without ever counting as spending.
    const holding = e.type === 'invest' ? await resolveHolding(store, e.destination) : '';
    const type = holding ? 'transfer'
      : ['expense', 'income', 'transfer'].includes(e.type) ? e.type
      : 'expense';
    await store.saveTx({
      id: crypto.randomUUID(),
      type,
      amount,
      category: holding ? 'Other' : await resolveCategory(store, e.category),
      note: String(e.note || '').slice(0, 200),
      // The user's own first account, not a hardcoded 'Cash' — someone whose
      // accounts are, say, "SBI"/"HDFC" was getting every voice/text entry
      // filed under a "Cash" account that doesn't exist for them. It stayed
      // invisible in the Accounts list while still counting toward the
      // overall net balance, which is money you can't see or manage.
      account: store.accounts[0]?.name || 'Cash', to_account: holding,
      occurred_at: occurred,
      created_at: Date.now(), updated_at: Date.now(), rev: 1, deleted: 0, source,
    });
    added++; sum += amount;
  }
  return { added, sum };
}
