import { CATEGORIES } from './constants';
import { normalizeGroup } from '../noteMatch';

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

// A group has no stored entity to look up or create — it's just text on the
// transaction. Reusing the EXISTING casing when one matches is what stops
// Gemini's own transcription/casing choices from forking a trip into a
// second, unrelated-looking group purely by spelling it slightly differently
// than the user has before (see normalizeGroup for why that matching is
// case/whitespace-insensitive).
function resolveGroup(store, name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const key = normalizeGroup(clean);
  const existing = store.groupNames().find((g) => normalizeGroup(g) === key);
  return existing || clean;
}

// Shared by voice and text quick-add: both hit Gemini endpoints returning the
// same {transactions:[...]} shape (see entrySchema() in lib/gemini.js).
//
// fallbackDate/fallbackAccount are whatever Ledger is currently scoped to
// (App.jsx's entryDate/entryAccount) — used ONLY when the parse itself
// didn't say otherwise, since what you actually spoke/typed always outranks
// ambient context.
export async function applyParsedTransactions(store, out, source, { fallbackDate, fallbackAccount } = {}) {
  const entries = out?.transactions || [];
  if (!entries.length) return { added: 0, sum: 0 };
  let added = 0, sum = 0;
  for (const e of entries) {
    const amount = Math.round((Number(e.amount_rupees) || 0) * 100);
    if (amount <= 0) continue;
    // spoken/written dates ("on 26th July", "yesterday") come back as YYYY-MM-DD
    let occurred = fallbackDate || Date.now();
    if (e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      const t = new Date(e.date + 'T12:00:00').getTime();
      if (Number.isFinite(t)) occurred = t;
    } else if (e.occurred_at_offset_days) {
      occurred = Date.now() + (Number(e.occurred_at_offset_days) || 0) * 86400000;
    }
    // An investment is stored as a transfer into a holding (the transactions
    // table only allows expense/income/transfer) — so it leaves the account
    // without ever counting as spending.
    const holding = e.type === 'invest' ? await resolveHolding(store, e.destination) : '';
    const type = holding ? 'transfer'
      : ['expense', 'income', 'transfer'].includes(e.type) ? e.type
      : 'expense';
    const parsedAccount = e.account ? store.accounts.find(a => a.name.toLowerCase() === e.account.toLowerCase())?.name : null;
    const accountName = parsedAccount || fallbackAccount || store.accounts[0]?.name || 'Cash';

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
      account: accountName, to_account: holding,
      project: resolveGroup(store, e.group),
      occurred_at: occurred,
      created_at: Date.now(), updated_at: Date.now(), rev: 1, deleted: 0, source,
    });
    added++; sum += amount;
  }
  return { added, sum };
}
