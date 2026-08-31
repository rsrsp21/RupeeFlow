// The money math, as pure functions over plain data.
//
// This lived inside StoreProvider as closures over React state, which meant
// none of it could be tested without mounting a component — and it is exactly
// the code where a mistake silently invents or destroys money. Every bug found
// in this area (a deleted entry resurrecting through the sync merge, a
// transfer to a non-existent account cancelling its own outflow, an investment
// counted as spending) would have been caught by a few assertions here.
//
// .mjs so both Next and `node --test` load it as ESM without the project
// having to become type:module.

const num = (v) => Number(v) || 0;
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/**
 * Income / spending totals for a list of entries.
 *
 * Investments are expenses that leave an account but aren't spending, so they
 * are reported separately rather than folded into `exp` — counting them as
 * spend made saving more look like overspending. Transfers are neither.
 */
export function computeTotals(list) {
  let inc = 0, exp = 0, saved = 0;
  for (const t of list) {
    if (t.type === 'income') inc += num(t.amount);
    else if (t.type === 'expense') {
      if (t.category === 'Investments') saved += num(t.amount);
      else exp += num(t.amount);
    }
  }
  return { inc, exp, saved };
}

/**
 * Balance per account.
 *
 * Only ever touches names that are real accounts. Creating a key for whatever
 * string an entry happened to carry meant a transfer to a name that wasn't an
 * account invented a matching credit out of nowhere: the money left the source
 * and reappeared under an account that doesn't exist, so any caller summing
 * the map saw the outflow cancel itself and the total never moved.
 */
export function computeAccountBalances(accounts, live) {
  const map = {};
  for (const a of accounts) map[a.name] = num(a.opening_balance);
  for (const t of live) {
    const amt = num(t.amount);
    if (t.type === 'income') {
      if (has(map, t.account)) map[t.account] += amt;
    } else if (t.type === 'expense') {
      if (has(map, t.account)) map[t.account] -= amt;
    } else if (t.type === 'transfer') {
      if (has(map, t.account)) map[t.account] -= amt;
      if (has(map, t.to_account)) map[t.to_account] += amt;
    }
  }
  return map;
}

/**
 * Accounts and holdings are two separate lists, but the ledger refers to both
 * by NAME alone — so a holding called "Savings" alongside an account called
 * "Savings" is indistinguishable to every function here.
 *
 * That collision was silently catastrophic: an ordinary account-to-account
 * transfer credited the destination ACCOUNT (spendable up) and, because the
 * name also matched a holding, credited that holding too (invested up). Net
 * worth grew by the full amount of a transfer that moved nothing, and the
 * entry rendered as "invest" everywhere — badge, savings rate, the balance
 * sheet handed to the AI.
 *
 * Accounts win. A transfer's destination dropdown only ever offers accounts,
 * so an account is what the user actually picked; the shadowed holding is
 * ignored for math until they rename one of the two.
 */
export function activeHoldings(accounts, holdings) {
  const taken = new Set((accounts || []).map((a) => String(a.name).toLowerCase()));
  return (holdings || []).filter((h) => !taken.has(String(h.name).toLowerCase()));
}

/** Names claimed by an account AND a holding — surfaced so the user can fix it. */
export function shadowedHoldingNames(accounts, holdings) {
  const taken = new Set((accounts || []).map((a) => String(a.name).toLowerCase()));
  return (holdings || []).filter((h) => taken.has(String(h.name).toLowerCase())).map((h) => h.name);
}

/**
 * Value per holding: whatever the user last said it was worth, plus anything
 * moved in or out SINCE that valuation.
 *
 * Contributions alone can't be the value — a fund that grew 30% would still
 * read as the amount paid in, and selling for more than you put in would drive
 * the balance negative while the profit vanished from net worth entirely.
 */
export function computeHoldingBalances(holdings, live) {
  const map = {};
  const since = {};
  for (const h of holdings) {
    const valued = num(h.valued_at);
    map[h.name] = valued > 0 ? num(h.current_value) : num(h.opening_balance);
    since[h.name] = valued;
  }
  for (const t of live) {
    if (t.type !== 'transfer') continue;
    const amt = num(t.amount);
    const at = num(t.occurred_at);
    if (has(map, t.to_account) && at > since[t.to_account]) map[t.to_account] += amt;
    if (has(map, t.account) && at > since[t.account]) map[t.account] -= amt;
  }
  return map;
}

/** Cost basis per holding — everything put in, minus everything taken out. */
export function computeHoldingContributed(holdings, live) {
  const map = {};
  for (const h of holdings) map[h.name] = num(h.opening_balance);
  for (const t of live) {
    if (t.type !== 'transfer') continue;
    const amt = num(t.amount);
    if (has(map, t.to_account)) map[t.to_account] += amt;
    if (has(map, t.account)) map[t.account] -= amt;
  }
  return map;
}

/**
 * A credit card is a liability, not a pot of money: its balance runs negative
 * as it's used and climbs back toward zero as the bill is paid, so it's
 * reported as dues rather than folded into spendable cash.
 */
export function computeNetWorth(accounts, holdings, live) {
  const bal = computeAccountBalances(accounts, live);
  const cards = new Set(accounts.filter((a) => a.type === 'Credit Card').map((a) => a.name));
  // An IOU account tracks what someone else owes you, not cash you can spend
  // right now — it's a real asset for net worth, but folding it into
  // spendable would overstate what's actually liquid until they pay you back.
  const ious = new Set(accounts.filter((a) => a.type === 'IOU').map((a) => a.name));
  let spendable = 0, dues = 0, owed = 0;
  for (const [name, v] of Object.entries(bal)) {
    if (cards.has(name)) dues += -v;
    else if (ious.has(name)) owed += v;
    else spendable += v;
  }
  // activeHoldings, not holdings — a holding shadowed by an account of the
  // same name would otherwise count the same rupee as spendable AND invested.
  const invested = Object.values(computeHoldingBalances(activeHoldings(accounts, holdings), live))
    .reduce((s, v) => s + v, 0);
  return { spendable, invested, dues, owed, total: spendable + invested + owed - dues };
}

/**
 * Last-write-wins, mirroring the server's UPSERT rule exactly: newer
 * `updated_at` wins, `rev` breaks a tie.
 *
 * A looser "incoming.updated_at >= local.updated_at" let a same-millisecond
 * server row overwrite a newer local one — which, for a just-deleted entry,
 * pulled the pre-delete version straight back in and resurrected it.
 */
export function isNewerTx(incoming, local) {
  if (!local) return true;
  const a = num(incoming.updated_at), b = num(local.updated_at);
  if (a > b) return true;
  if (a < b) return false;
  return num(incoming.rev) >= num(local.rev);
}

// Groups digits the Indian way — last three, then pairs: 2,00,00,000. Used
// on every amount input so a large figure is readable while it's being
// typed, instead of a wall of digits you have to count. toPaise() already
// strips commas, so the grouped text stays directly parseable and can be
// held in state as-is. Idempotent: regrouping already-grouped text is a
// no-op, which is what makes it safe to run on every keystroke.
export function groupIndian(input) {
  const cleaned = String(input ?? '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const dot = cleaned.indexOf('.');
  // Only the first dot counts; later ones are dropped rather than rejected,
  // so a stray keypress doesn't wipe what's already typed.
  const whole = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const frac = dot === -1 ? '' : '.' + cleaned.slice(dot + 1).replace(/\./g, '');
  if (!whole) return frac;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  return (rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3) + frac;
}
