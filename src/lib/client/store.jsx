'use client';
// Central store: auth, ledger state, offline-first sync engine (outbox + LWW
// pull cursor + polling for near-real-time cross-device updates).
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { idbPut, idbAll, idbClear } from './idb';
import { monthKey, ACCOUNTS as DEFAULT_ACCOUNTS } from './constants';
import { buildNoteHistory } from '../noteMatch';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

// Accounts used to be plain strings; migrate anything saved before the
// type/name split (a plain string, or an object missing type) by matching
// against the known default names, falling back to 'Other'.
function normalizeAccount(raw) {
  // 'Savings' used to be an account type. It isn't any more — savings and
  // investments are holdings now (see HOLDING_TYPES), not spendable accounts —
  // so anything still carrying it lands on the closest surviving type.
  const fixType = (t) => (t === 'Savings' ? 'Bank' : t || 'Other');
  if (raw && typeof raw === 'object' && raw.name) {
    return {
      name: String(raw.name).trim(), type: fixType(raw.type),
      opening_balance: Number(raw.opening_balance) || 0,
      limit_amount: Math.max(0, Number(raw.limit_amount) || 0),
    };
  }
  const name = String(raw || '').trim();
  const known = DEFAULT_ACCOUNTS.find((d) => d.name.toLowerCase() === name.toLowerCase());
  return { name, type: known ? known.type : 'Other', opening_balance: 0, limit_amount: 0 };
}

function normalizeHolding(raw) {
  return {
    name: String(raw?.name || '').trim(),
    kind: raw?.kind || 'Other',
    opening_balance: Number(raw?.opening_balance) || 0,
  };
}

// This interval fires a real API call (/api/tx/pull, and /api/tx/push if the
// outbox isn't empty) for every open, visible tab — regardless of whether
// anything changed. It exists only to notice edits made on ANOTHER device
// while this tab sits open and idle; your own edits already sync instantly
// via syncSoon(), and focus/reconnect already trigger an immediate sync too.
// Kept long specifically to avoid hammering the serverless functions with a
// steady drumbeat of calls per concurrent user.
const POLL_MS = 60000;

// How far back each pull rewinds its cursor, to absorb clock differences
// between a user's devices (see the comment at the pull call). Generous on
// purpose: a day's worth of changed rows is a handful of records for a
// personal ledger, and missing an update is far worse than re-fetching one.
const PULL_OVERLAP_MS = 24 * 60 * 60 * 1000;

export function StoreProvider({ children }) {
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [booted, setBooted] = useState(false);
  const [txs, setTxs] = useState({});           // id → transaction
  const [budgets, setBudgets] = useState([]);
  // Starts empty rather than defaulting to Cash/Bank/UPI/... — a genuinely
  // new user picks their own first account (see AddAccountModal) instead of
  // being handed five they may not all use. See the boot effect for how an
  // *existing* user's account list gets derived if they never explicitly saved one.
  const [accounts, setAccounts] = useState([]);
  const [customCategories, setCustomCategories] = useState([]); // [{name, icon_svg, color}]
  const [holdings, setHoldings] = useState([]); // [{name, kind, opening_balance}]
  const [syncState, setSyncState] = useState('offline'); // offline|pending|online|error
  const [lastSync, setLastSync] = useState(0);
  // Flips true once the first sync attempt (success or failure) resolves —
  // an existing user on a fresh device/browser has zero *local* accounts
  // until their real history arrives from the server, so onboarding must
  // wait for this rather than judging "zero accounts" off the pre-sync
  // instant, which is what made the onboarding modal briefly flash for them.
  const [firstSyncDone, setFirstSyncDone] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const cursor = useRef(0);
  const txsRef = useRef({});
  const tokenRef = useRef(null);
  const accountsRef = useRef([]);
  const holdingsRef = useRef([]);
  txsRef.current = txs;
  tokenRef.current = token;
  accountsRef.current = accounts;
  holdingsRef.current = holdings;

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toast._h);
    toast._h = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  // ── API helper ──
  const api = useCallback(async (path, opts = {}) => {
    // AI endpoints need the network; fail with a clear message instead of a raw fetch error
    if (typeof navigator !== 'undefined' && !navigator.onLine && path.startsWith('/ai/')) {
      throw new Error('AI features need an internet connection');
    }
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenRef.current}`, ...(opts.headers || {}) },
    });
    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── sync engine ──
  const syncing = useRef(false);
  const syncNow = useCallback(async () => {
    if (!tokenRef.current || syncing.current) return;
    syncing.current = true;
    setSyncState('pending');
    try {
      const outbox = await idbAll('outbox');
      if (outbox.length) {
        await api('/tx/push', { method: 'POST', body: JSON.stringify({ transactions: outbox }) });
        await idbClear('outbox');
      }
      // Rewind the cursor by a window rather than asking for strictly
      // newer-than-what-we've-seen. `updated_at` is stamped with the *writing
      // device's* Date.now(), so two devices with even slightly different
      // clocks break the "cursor only moves forward" assumption: if this
      // device pulled a row written at T' and another device then writes at
      // T < T' (its clock is behind, or it was offline), that write has an
      // updated_at below our cursor and `updated_at > since` skips it
      // permanently — no amount of polling ever recovers it. That's how a
      // deleted entry could stay deleted on the server yet keep counting
      // toward totals here forever. Re-pulling a window's worth of rows every
      // sync is cheap and the LWW merge below makes re-applying a no-op.
      const since = Math.max(0, cursor.current - PULL_OVERLAP_MS);
      const { transactions, serverTime } = await api(`/tx/pull?since=${since}`);
      if (transactions.length) {
        setTxs((prev) => {
          const next = { ...prev };
          for (const t of transactions) {
            const local = next[t.id];
            // Mirror the server's own LWW rule exactly (updated_at, then rev
            // as the tiebreak). A blanket `>=` let a same-millisecond server
            // row overwrite a newer local one — which for a just-deleted
            // entry meant pulling the pre-delete version straight back in
            // and resurrecting it, deleted flag and all.
            const newer = !local
              || t.updated_at > local.updated_at
              || (t.updated_at === local.updated_at && (t.rev || 0) >= (local.rev || 0));
            if (newer) { next[t.id] = t; idbPut('tx', t); }
            cursor.current = Math.max(cursor.current, t.updated_at);
          }
          return next;
        });
      }
      await idbPut('meta', { k: 'cursor', v: cursor.current });
      setLastSync(serverTime);
      setSyncState('online');
    } catch {
      setSyncState(typeof navigator !== 'undefined' && navigator.onLine ? 'error' : 'offline');
    } finally { syncing.current = false; setFirstSyncDone(true); }
  }, [api]);

  const syncTimer = useRef(null);
  const syncSoon = useCallback(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncNow, 400);
  }, [syncNow]);

  // Save locally (instant UI + offline queue), then sync. Also registers a
  // Background Sync tag (Chrome/Android) so the outbox still gets pushed by
  // the service worker if the user closes the app before reconnecting —
  // syncSoon() alone only helps while this page stays open.
  const saveTx = useCallback(async (t) => {
    setTxs((prev) => ({ ...prev, [t.id]: t }));
    await idbPut('tx', t);
    await idbPut('outbox', t);
    syncSoon();
    try {
      const reg = await navigator.serviceWorker?.ready;
      await reg?.sync?.register('sync-outbox');
    } catch {}
  }, [syncSoon]);

  // ── budgets ──
  // Optimistic: apply locally and resolve immediately so the UI never waits
  // on the D1 round-trip; the PUT is fired in the background.
  const saveBudget = useCallback((b) => {
    setBudgets((prev) => {
      const i = prev.findIndex((x) => x.month === b.month && x.category === b.category);
      const next = i >= 0 ? prev.map((x, j) => (j === i ? b : x)) : [...prev, b];
      idbPut('meta', { k: 'budgets', v: next });
      return next;
    });
    api('/budgets', { method: 'PUT', body: JSON.stringify({ budgets: [b] }) }).catch(() => {});
  }, [api]);

  const deleteBudget = useCallback((month, category) => {
    setBudgets((prev) => {
      const next = prev.filter((x) => !(x.month === month && x.category === category));
      idbPut('meta', { k: 'budgets', v: next });
      return next;
    });
    api('/budgets', { method: 'DELETE', body: JSON.stringify({ month, category }) }).catch(() => {});
  }, [api]);

  // Loads whatever's already cached in IndexedDB for this device — txs,
  // budgets, custom categories, and accounts (falling back to deriving
  // accounts from real transaction history if no explicit list was ever
  // saved; see the inline comment where that matters). Shared by the boot
  // effect and authenticate(): logging in through the form doesn't reload
  // the page, so without this it never ran at all — accounts stayed at its
  // initial empty state until the first sync pull arrived over the network,
  // which is exactly the multi-second window where "add your first
  // account" onboarding incorrectly flashed for an existing user signing in.
  const hydrateFromCache = useCallback(async () => {
    const all = await idbAll('tx');
    const map = {};
    for (const tx of all) map[tx.id] = tx;
    setTxs(map);
    const metas = await idbAll('meta');
    cursor.current = metas.find((m) => m.k === 'cursor')?.v || 0;
    setBudgets(metas.find((m) => m.k === 'budgets')?.v || []);
    setCustomCategories(metas.find((m) => m.k === 'categories')?.v || []);
    setHoldings((metas.find((m) => m.k === 'holdings')?.v || []).map(normalizeHolding));
    const savedAccounts = metas.find((m) => m.k === 'accounts')?.v;
    if (savedAccounts?.length) {
      setAccounts(savedAccounts.map(normalizeAccount));
    } else {
      // No explicit list saved (an existing user who never happened to
      // add/rename/remove an account, so saveAccounts() was never called) —
      // derive one from their real transaction history instead.
      const names = new Set();
      // Non-deleted only — a deleted entry shouldn't conjure back an account
      // the user no longer has anything in.
      for (const tx of all) {
        if (tx.deleted) continue;
        if (tx.account) names.add(tx.account);
        if (tx.to_account) names.add(tx.to_account);
      }
      if (names.size) {
        const derived = [...names].map(normalizeAccount);
        setAccounts(derived);
        idbPut('meta', { k: 'accounts', v: derived });
      }
    }
  }, []);

  // ── auth ──
  const authenticate = useCallback(async (mode, emailIn, password, nameIn) => {
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailIn, password, name: nameIn }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    // IndexedDB isn't namespaced per user, and logout() deliberately leaves
    // it in place (so re-logging in as the SAME user is instant) — so if a
    // DIFFERENT account was last cached on this device, that data must be
    // wiped rather than loaded here. Otherwise this session would inherit
    // their transactions/accounts, and hydrateFromCache would seed the sync
    // cursor from their position — silently hiding this user's own older
    // entries until a full resync happened to correct it.
    const priorEmail = (await idbAll('meta')).find((m) => m.k === 'lastUserEmail')?.v;
    if (priorEmail && priorEmail !== data.email) {
      await idbClear('tx'); await idbClear('outbox'); await idbClear('meta');
      cursor.current = 0;
    }

    localStorage.setItem('rf_token', data.token);
    localStorage.setItem('rf_email', data.email);
    localStorage.setItem('rf_name', data.name || '');
    // Also mirrored into IndexedDB — the service worker can't reach localStorage,
    // but needs the token to push the outbox during a Background Sync event.
    idbPut('meta', { k: 'token', v: data.token });
    idbPut('meta', { k: 'lastUserEmail', v: data.email });
    await hydrateFromCache();
    setToken(data.token); setEmail(data.email); setName(data.name || '');
  }, [hydrateFromCache]);

  // Optimistic: reflect the new name instantly, sync to the server in the
  // background, and roll back with a toast if that save actually fails.
  const saveName = useCallback((nameIn) => {
    const clean = (nameIn || '').trim().slice(0, 80);
    const prev = name;
    localStorage.setItem('rf_name', clean);
    setName(clean);
    api('/auth/profile', { method: 'PUT', body: JSON.stringify({ name: clean }) }).catch(() => {
      localStorage.setItem('rf_name', prev);
      setName(prev);
      toast("Couldn't save name. Check your connection.");
    });
  }, [api, name, toast]);

  const logout = useCallback(() => {
    localStorage.removeItem('rf_token');
    localStorage.removeItem('rf_email');
    localStorage.removeItem('rf_name');
    idbPut('meta', { k: 'token', v: null });
    window.location.reload();
  }, []);

  // Permanent: erases the account and every entry/budget/subscription tied
  // to it server-side, then wipes the local cache too (unlike logout, which
  // leaves it in place so signing back in as the same user is instant —
  // that cache would just be orphaned data once the account is gone).
  const deleteAccount = useCallback(async () => {
    await api('/auth/profile', { method: 'DELETE' });
    localStorage.removeItem('rf_token');
    localStorage.removeItem('rf_email');
    localStorage.removeItem('rf_name');
    localStorage.removeItem('rf_view');
    await idbClear('tx'); await idbClear('outbox'); await idbClear('meta');
    window.location.reload();
  }, [api]);

  // ── boot: restore session + hydrate from IndexedDB (works fully offline) ──
  useEffect(() => {
    const t = localStorage.getItem('rf_token');
    setToken(t);
    setEmail(localStorage.getItem('rf_email') || '');
    setName(localStorage.getItem('rf_name') || '');
    (async () => {
      if (t) {
        idbPut('meta', { k: 'token', v: t }); // keep the SW's mirror in sync too
        // Passive restore of the current session, not a new login — just
        // keep the marker current, never clear anything here (that only
        // happens in authenticate(), at the moment a *different* user logs in).
        const currentEmail = localStorage.getItem('rf_email') || '';
        if (currentEmail) idbPut('meta', { k: 'lastUserEmail', v: currentEmail });
        // Doing this before setBooted(true), with nothing else awaited in
        // between, matters: React batches the setState calls inside it into
        // the same commit as booted flipping, so the app never observes an
        // in-between render where booted is already true but accounts is
        // still empty (see hydrateFromCache's own comment for what that used
        // to cause).
        await hydrateFromCache();
      }
      setBooted(true);
    })();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [hydrateFromCache]);

  // Same derivation as in the boot effect above, but reactive — covers the
  // one case that one-time check at boot can't: a *fresh device* with no
  // local IndexedDB cache, where accounts only becomes derivable once the
  // first sync pull actually arrives (which happens well after booted flips
  // to true). Harmless no-op otherwise, since it bails out the instant
  // accounts is non-empty.
  useEffect(() => {
    if (!booted || accounts.length > 0) return;
    const list = Object.values(txs).filter((t) => !t.deleted);
    if (!list.length) return;
    const names = new Set();
    for (const t of list) { if (t.account) names.add(t.account); if (t.to_account) names.add(t.to_account); }
    if (!names.size) return;
    const derived = [...names].map(normalizeAccount);
    setAccounts(derived);
    idbPut('meta', { k: 'accounts', v: derived });
  }, [txs, booted, accounts.length]);

  // Budgets/categories/accounts previously were only ever fetched once, right
  // after login — so a change made on another device (like adding an
  // account) never showed up here until you signed out and back in. Pulled
  // this into its own function so it can run on the same cadence as
  // transaction sync (poll/focus/online), not just at login.
  const refreshMeta = useCallback(async () => {
    try {
      const { budgets: remote } = await api('/budgets');
      if (remote?.length) { setBudgets(remote); idbPut('meta', { k: 'budgets', v: remote }); }
    } catch {}
    try {
      const { categories: remote } = await api('/categories');
      setCustomCategories(remote || []);
      idbPut('meta', { k: 'categories', v: remote || [] });
    } catch {}
    try {
      const { accounts: remote } = await api('/accounts');
      if (remote?.length) {
        // Empty here just means this device derived its list from
        // transaction history and never explicitly pushed one — don't
        // erase that guess.
        const normalized = remote.map(normalizeAccount);
        setAccounts(normalized);
        idbPut('meta', { k: 'accounts', v: normalized });
      } else if (accountsRef.current.length) {
        // Backfill: this device has a real local account list from before
        // accounts synced to the server at all (or before this device ever
        // got a chance to push it) — push it once so other devices can see
        // it too. Once this succeeds, the next refresh finds a non-empty
        // remote list and this branch stops firing.
        api('/accounts', { method: 'PUT', body: JSON.stringify({ accounts: accountsRef.current }) }).catch(() => {});
      }
    } catch {}
    try {
      const { holdings: remote } = await api('/holdings');
      if (remote?.length) {
        const normalized = remote.map(normalizeHolding);
        setHoldings(normalized);
        idbPut('meta', { k: 'holdings', v: normalized });
      } else if (holdingsRef.current.length) {
        api('/holdings', { method: 'PUT', body: JSON.stringify({ holdings: holdingsRef.current }) }).catch(() => {});
      }
    } catch {}
  }, [api]);

  // Escape hatch for a device that already drifted out of sync before the
  // overlap window above existed — an edit or delete older than the window
  // can't be recovered by normal polling, since the cursor has permanently
  // moved past it. Resetting the cursor to 0 makes the next pull re-fetch
  // the entire ledger; the LWW merge then overwrites every stale local row
  // with the server's version. Deliberately does NOT clear local data first,
  // so a failed pull can't leave the device empty.
  const resync = useCallback(async () => {
    cursor.current = 0;
    await idbPut('meta', { k: 'cursor', v: 0 });
    await syncNow();
    await refreshMeta();
  }, [syncNow, refreshMeta]);

  // ── near-real-time: poll while visible, sync on focus/online ──
  useEffect(() => {
    if (!token) return;
    syncNow();
    refreshMeta();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') { syncNow(); refreshMeta(); } }, POLL_MS);
    const onFocus = () => { syncNow(); refreshMeta(); };
    const onOnline = () => { syncNow(); refreshMeta(); };
    const onOffline = () => setSyncState('offline');
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [token, syncNow, api, refreshMeta]);

  // ── derived helpers (always recomputed from ledger — integrity by design) ──
  const live = useCallback(() => Object.values(txsRef.current).filter((t) => !t.deleted), []);

  // Investments (SIPs, stocks, FDs, etc.) leave an account like an expense
  // does, but the money isn't spent — it's still yours, just moved. Counting
  // it as spend would inflate "Spent"/budget-pace numbers and make saving
  // more look like the wrong outcome, so it's split out into `saved` instead
  // of folded into `exp`. Per-category tracking (catSpend, an "Investments"
  // budget) is untouched — this only affects the aggregate totals.
  const totals = (list) => {
    let inc = 0, exp = 0, saved = 0;
    for (const t of list) {
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') {
        if (t.category === 'Investments') saved += t.amount;
        else exp += t.amount;
      }
    }
    return { inc, exp, saved };
  };
  const inMonth = (t, mk = monthKey()) => monthKey(new Date(Number(t.occurred_at))) === mk;
  const catSpend = (mk = monthKey()) => {
    const map = {};
    for (const t of live()) if (t.type === 'expense' && inMonth(t, mk)) map[t.category] = (map[t.category] || 0) + t.amount;
    return map;
  };
  const effectiveBudget = (category, mk) => {
    const b = budgets.find((x) => x.month === mk && x.category === category);
    if (!b) return null;
    let amt = Number(b.amount);
    if (b.carry_forward) {
      const [y, m] = mk.split('-').map(Number);
      const prevMk = monthKey(new Date(y, m - 2, 1));
      const prevB = budgets.find((x) => x.month === prevMk && x.category === category);
      if (prevB) {
        const prevSpent = category
          ? (catSpend(prevMk)[category] || 0)
          : totals(live().filter((t) => inMonth(t, prevMk))).exp;
        amt += Math.max(0, Number(prevB.amount) - prevSpent);
      }
    }
    return amt;
  };
  const noteHistory = () => buildNoteHistory(live());

  // ── accounts ──
  // Used to only save locally (IndexedDB) with no server call at all, so an
  // account added on one device never reached any other until the next
  // login re-derived it from synced transaction history. Now pushed to
  // /api/accounts like budgets/categories already were, with an optimistic
  // apply + rollback on failure (same pattern as saveName).
  const saveAccounts = useCallback(async (list) => {
    const seen = new Set();
    const clean = [];
    for (const raw of list) {
      const a = normalizeAccount(raw);
      if (!a.name || seen.has(a.name.toLowerCase())) continue;
      seen.add(a.name.toLowerCase());
      clean.push(a);
    }
    const prev = accounts;
    setAccounts(clean);
    await idbPut('meta', { k: 'accounts', v: clean });
    try {
      await api('/accounts', { method: 'PUT', body: JSON.stringify({ accounts: clean }) });
    } catch (e) {
      setAccounts(prev);
      idbPut('meta', { k: 'accounts', v: prev });
      toast("Couldn't save that — check your connection and try again");
      throw e;
    }
  }, [api, accounts, toast]);

  // What icon an account (by name, as stored on a transaction) should use —
  // 'Other' for anything renamed/removed since the transaction was recorded.
  const accountType = (name) => accounts.find((a) => a.name === name)?.type || 'Other';

  // ── custom categories ──
  // Generates the icon and persists the category server-side in one round
  // trip (see /api/ai/category-icon) — returns the saved record so the
  // caller (TxModal) can select it immediately.
  const addCustomCategory = useCallback(async (name) => {
    const saved = await api('/ai/category-icon', { method: 'POST', body: JSON.stringify({ name }) });
    setCustomCategories((prev) => {
      const next = [...prev.filter((c) => c.name !== saved.name), saved];
      idbPut('meta', { k: 'categories', v: next });
      return next;
    });
    return saved;
  }, [api]);

  // Deleting a category can't just drop it — any transaction still tagged
  // with it would point at a category with no definition/icon, and any
  // budget for it would silently stop tracking anything. Reassign those
  // transactions to "Other" and drop budgets for it first, same as picking
  // "Other" manually would have done.
  const removeCustomCategory = useCallback(async (name) => {
    const affected = Object.values(txsRef.current).filter((t) => !t.deleted && t.category === name);
    for (const t of affected) {
      await saveTx({ ...t, category: 'Other', updated_at: Date.now(), rev: (t.rev || 0) + 1 });
    }
    for (const b of budgets.filter((x) => x.category === name)) {
      deleteBudget(b.month, b.category);
    }
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c.name !== name);
      idbPut('meta', { k: 'categories', v: next });
      return next;
    });
    api('/categories', { method: 'DELETE', body: JSON.stringify({ name }) }).catch(() => {});
    return affected.length;
  }, [api, saveTx, budgets, deleteBudget]);

  // Balance per account, derived from the ledger: income in, expense out,
  // transfers move between the two named accounts.
  // Only ever touches names that are real accounts. It used to create a key
  // for whatever string a transaction carried, so a transfer to a name that
  // wasn't an account (the add-entry form used to default the destination to
  // a literal 'Bank') invented a matching credit out of thin air — the money
  // left the source account and silently reappeared under a account that
  // doesn't exist, so any caller summing the map saw the outflow cancel
  // itself out and the total never moved.
  const accountBalances = useCallback(() => {
    const map = {};
    const isAccount = (n) => Object.prototype.hasOwnProperty.call(map, n);
    for (const a of accounts) map[a.name] = Number(a.opening_balance) || 0;
    for (const t of live()) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') { if (isAccount(t.account)) map[t.account] += amt; }
      else if (t.type === 'expense') { if (isAccount(t.account)) map[t.account] -= amt; }
      else if (t.type === 'transfer') {
        if (isAccount(t.account)) map[t.account] -= amt;
        if (isAccount(t.to_account)) map[t.to_account] += amt;
      }
    }
    return map;
  }, [accounts, txs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same derivation for savings/investments. A holding is funded by a
  // transfer whose destination is the holding, and drawn down by a transfer
  // out of it back into a real account — so investing never counts as
  // spending, but it does leave your spendable balance.
  const holdingBalances = useCallback(() => {
    const map = {};
    const isHolding = (n) => Object.prototype.hasOwnProperty.call(map, n);
    for (const h of holdings) map[h.name] = Number(h.opening_balance) || 0;
    for (const t of live()) {
      if (t.type !== 'transfer') continue;
      const amt = Number(t.amount) || 0;
      if (isHolding(t.to_account)) map[t.to_account] += amt;
      if (isHolding(t.account)) map[t.account] -= amt;
    }
    return map;
  }, [holdings, txs]); // eslint-disable-line react-hooks/exhaustive-deps

  const sumValues = (m) => Object.values(m).reduce((s, v) => s + v, 0);
  // A credit card is a liability, not a pot of money — its balance runs
  // negative as you spend and climbs back toward zero as you pay the bill, so
  // it's reported as "dues" rather than folded into spendable cash. (Its
  // starting balance is captured as what you currently OWE and stored
  // negative; entering an available credit limit there would invent money
  // that was never yours.)
  const netWorth = () => {
    const bal = accountBalances();
    const cards = new Set(accounts.filter((a) => a.type === 'Credit Card').map((a) => a.name));
    let spendable = 0, dues = 0;
    for (const [name, v] of Object.entries(bal)) {
      if (cards.has(name)) dues += -v; // negative balance = owed
      else spendable += v;
    }
    const invested = sumValues(holdingBalances());
    return { spendable, invested, dues, total: spendable + invested - dues };
  };

  // Transactions reference accounts, holdings and categories by NAME, so a
  // rename that only touched the definition would orphan every entry using
  // it — the balance would reset to its opening value and the old name would
  // linger on each row. These rewrite the affected transactions too, as
  // ordinary versioned edits so the change syncs like any other.
  const renameTxField = useCallback(async (field, oldName, newName) => {
    const affected = Object.values(txsRef.current).filter((t) => !t.deleted && t[field] === oldName);
    for (const t of affected) {
      await saveTx({ ...t, [field]: newName, updated_at: Date.now(), rev: (t.rev || 0) + 1 });
    }
    return affected.length;
  }, [saveTx]);

  const saveHoldings = useCallback(async (list) => {
    const seen = new Set();
    const clean = [];
    for (const raw of list) {
      const h = normalizeHolding(raw);
      if (!h.name || seen.has(h.name.toLowerCase())) continue;
      seen.add(h.name.toLowerCase());
      clean.push(h);
    }
    const prev = holdingsRef.current;
    setHoldings(clean);
    await idbPut('meta', { k: 'holdings', v: clean });
    try {
      await api('/holdings', { method: 'PUT', body: JSON.stringify({ holdings: clean }) });
    } catch (e) {
      setHoldings(prev);
      idbPut('meta', { k: 'holdings', v: prev });
      toast("Couldn't save that — check your connection and try again");
      throw e;
    }
  }, [api, toast]);

  const renameAccount = useCallback(async (oldName, newName) => {
    const clean = String(newName || '').trim();
    if (!clean || clean === oldName) return 0;
    if (accountsRef.current.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('An account with that name already exists');
    }
    const moved = await renameTxField('account', oldName, clean);
    const moved2 = await renameTxField('to_account', oldName, clean);
    await saveAccounts(accountsRef.current.map((a) => (a.name === oldName ? { ...a, name: clean } : a)));
    return moved + moved2;
  }, [renameTxField, saveAccounts]);

  const renameHolding = useCallback(async (oldName, newName) => {
    const clean = String(newName || '').trim();
    if (!clean || clean === oldName) return 0;
    if (holdingsRef.current.some((h) => h.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('A holding with that name already exists');
    }
    const moved = await renameTxField('account', oldName, clean);
    const moved2 = await renameTxField('to_account', oldName, clean);
    await saveHoldings(holdingsRef.current.map((h) => (h.name === oldName ? { ...h, name: clean } : h)));
    return moved + moved2;
  }, [renameTxField, saveHoldings]);

  // Categories are keyed by (user_id, name) server-side, so a rename is a
  // create-then-delete rather than an update. The new name reuses the old
  // icon instead of burning another AI generation on it.
  const renameCustomCategory = useCallback(async (oldName, newName) => {
    const clean = String(newName || '').trim();
    if (!clean || clean === oldName) return 0;
    const prev = customCategories.find((c) => c.name === oldName);
    if (customCategories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('A category with that name already exists');
    }
    await api('/categories', {
      method: 'PUT',
      body: JSON.stringify({ name: clean, icon_svg: prev?.icon_svg || '', color: prev?.color || '#9ca3af' }),
    });
    api('/categories', { method: 'DELETE', body: JSON.stringify({ name: oldName }) }).catch(() => {});
    setCustomCategories((list) => {
      const next = list.map((c) => (c.name === oldName ? { ...c, name: clean } : c));
      idbPut('meta', { k: 'categories', v: next });
      return next;
    });
    return renameTxField('category', oldName, clean);
  }, [api, customCategories, renameTxField]);


  // AI summary for insights/Q&A — built from real ledger data
  const buildSummary = (daysBack = 35) => {
    const cut = Date.now() - daysBack * 86400000;
    const list = live().filter((t) => t.occurred_at >= cut);
    const mk = monthKey();
    const byCat = {}, byWeek = { thisWeek: 0, lastWeek: 0 };
    const weekStart = Date.now() - 7 * 86400000, prevStart = Date.now() - 14 * 86400000;
    for (const t of list) {
      if (t.type !== 'expense') continue;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount / 100;
      if (t.occurred_at >= weekStart) byWeek.thisWeek += t.amount / 100;
      else if (t.occurred_at >= prevStart) byWeek.lastWeek += t.amount / 100;
    }
    const mt = totals(live().filter((t) => inMonth(t)));
    return {
      month_income_rupees: mt.inc / 100, month_expense_rupees: mt.exp / 100,
      spend_by_category_rupees: byCat,
      week_compare_rupees: byWeek,
      budgets: budgets.filter((b) => b.month === mk).map((b) => ({
        category: b.category || 'overall', budget_rupees: Number(b.amount) / 100,
      })),
      biggest_recent_expenses: list.filter((t) => t.type === 'expense')
        .sort((a, b) => b.amount - a.amount).slice(0, 5)
        .map((t) => ({ note: t.note || t.category, category: t.category, rupees: t.amount / 100 })),
      entry_count: list.length,
    };
  };

  const value = {
    token, email, name, booted, txs, budgets, accounts, holdings, customCategories, syncState, lastSync, firstSyncDone, toastMsg,
    api, toast, syncNow, resync, saveTx, saveBudget, deleteBudget, saveAccounts, authenticate, saveName, logout, deleteAccount,
    live, totals, inMonth, catSpend, effectiveBudget, noteHistory, accountBalances, holdingBalances, netWorth, saveHoldings, accountType, buildSummary,
    renameAccount, renameHolding, renameCustomCategory,
    addCustomCategory, removeCustomCategory,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
