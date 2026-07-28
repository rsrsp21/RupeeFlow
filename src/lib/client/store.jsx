'use client';
// Central store: auth, ledger state, offline-first sync engine (outbox + LWW
// pull cursor + polling for near-real-time cross-device updates).
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { idbPut, idbAll, idbClear } from './idb';
import { monthKey, ACCOUNTS as DEFAULT_ACCOUNTS } from './constants';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const POLL_MS = 5000;

export function StoreProvider({ children }) {
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState('');
  const [booted, setBooted] = useState(false);
  const [txs, setTxs] = useState({});           // id → transaction
  const [budgets, setBudgets] = useState([]);
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [syncState, setSyncState] = useState('offline'); // offline|pending|online|error
  const [lastSync, setLastSync] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const cursor = useRef(0);
  const txsRef = useRef({});
  const tokenRef = useRef(null);
  txsRef.current = txs;
  tokenRef.current = token;

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
      const { transactions, serverTime } = await api(`/tx/pull?since=${cursor.current}`);
      if (transactions.length) {
        setTxs((prev) => {
          const next = { ...prev };
          for (const t of transactions) {
            const local = next[t.id];
            if (!local || t.updated_at >= local.updated_at) { next[t.id] = t; idbPut('tx', t); }
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
    } finally { syncing.current = false; }
  }, [api]);

  const syncTimer = useRef(null);
  const syncSoon = useCallback(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncNow, 400);
  }, [syncNow]);

  // Save locally (instant UI + offline queue), then sync
  const saveTx = useCallback(async (t) => {
    setTxs((prev) => ({ ...prev, [t.id]: t }));
    await idbPut('tx', t);
    await idbPut('outbox', t);
    syncSoon();
  }, [syncSoon]);

  // ── budgets ──
  const saveBudget = useCallback(async (b) => {
    setBudgets((prev) => {
      const i = prev.findIndex((x) => x.month === b.month && x.category === b.category);
      const next = i >= 0 ? prev.map((x, j) => (j === i ? b : x)) : [...prev, b];
      idbPut('meta', { k: 'budgets', v: next });
      return next;
    });
    try { await api('/budgets', { method: 'PUT', body: JSON.stringify({ budgets: [b] }) }); } catch {}
  }, [api]);

  // ── auth ──
  const authenticate = useCallback(async (mode, emailIn, password) => {
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailIn, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    localStorage.setItem('rf_token', data.token);
    localStorage.setItem('rf_email', data.email);
    setToken(data.token); setEmail(data.email);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('rf_token');
    localStorage.removeItem('rf_email');
    window.location.reload();
  }, []);

  // ── boot: restore session + hydrate from IndexedDB (works fully offline) ──
  useEffect(() => {
    const t = localStorage.getItem('rf_token');
    setToken(t);
    setEmail(localStorage.getItem('rf_email') || '');
    (async () => {
      if (t) {
        const all = await idbAll('tx');
        const map = {};
        for (const tx of all) map[tx.id] = tx;
        setTxs(map);
        const metas = await idbAll('meta');
        cursor.current = metas.find((m) => m.k === 'cursor')?.v || 0;
        setBudgets(metas.find((m) => m.k === 'budgets')?.v || []);
        const savedAccounts = metas.find((m) => m.k === 'accounts')?.v;
        if (savedAccounts?.length) setAccounts(savedAccounts);
      }
      setBooted(true);
    })();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // ── near-real-time: poll while visible, sync on focus/online ──
  useEffect(() => {
    if (!token) return;
    syncNow();
    (async () => {
      try {
        const { budgets: remote } = await api('/budgets');
        if (remote?.length) { setBudgets(remote); idbPut('meta', { k: 'budgets', v: remote }); }
      } catch {}
    })();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, POLL_MS);
    const onFocus = () => syncNow();
    const onOnline = () => syncNow();
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
  }, [token, syncNow, api]);

  // ── derived helpers (always recomputed from ledger — integrity by design) ──
  const live = useCallback(() => Object.values(txsRef.current).filter((t) => !t.deleted), []);

  const totals = (list) => {
    let inc = 0, exp = 0;
    for (const t of list) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; }
    return { inc, exp };
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
  const projects = () => [...new Set(live().map((t) => t.project).filter(Boolean))].sort();

  // ── accounts ──
  const saveAccounts = useCallback(async (list) => {
    const clean = [...new Set(list.map((a) => String(a).trim()).filter(Boolean))];
    setAccounts(clean);
    await idbPut('meta', { k: 'accounts', v: clean });
  }, []);

  // Balance per account, derived from the ledger: income in, expense out,
  // transfers move between the two named accounts.
  const accountBalances = useCallback(() => {
    const map = {};
    for (const a of accounts) map[a] = 0;
    for (const t of live()) {
      const amt = Number(t.amount);
      if (t.type === 'income') map[t.account] = (map[t.account] || 0) + amt;
      else if (t.type === 'expense') map[t.account] = (map[t.account] || 0) - amt;
      else if (t.type === 'transfer') {
        map[t.account] = (map[t.account] || 0) - amt;
        map[t.to_account] = (map[t.to_account] || 0) + amt;
      }
    }
    return map;
  }, [accounts, txs]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI summary for insights/Q&A — built from real ledger data
  const buildSummary = (daysBack = 35) => {
    const cut = Date.now() - daysBack * 86400000;
    const list = live().filter((t) => t.occurred_at >= cut);
    const mk = monthKey();
    const byCat = {}, byProject = {}, byWeek = { thisWeek: 0, lastWeek: 0 };
    const weekStart = Date.now() - 7 * 86400000, prevStart = Date.now() - 14 * 86400000;
    for (const t of list) {
      if (t.type !== 'expense') continue;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount / 100;
      if (t.project) byProject[t.project] = (byProject[t.project] || 0) + t.amount / 100;
      if (t.occurred_at >= weekStart) byWeek.thisWeek += t.amount / 100;
      else if (t.occurred_at >= prevStart) byWeek.lastWeek += t.amount / 100;
    }
    const mt = totals(live().filter((t) => inMonth(t)));
    return {
      month_income_rupees: mt.inc / 100, month_expense_rupees: mt.exp / 100,
      spend_by_category_rupees: byCat, spend_by_project_rupees: byProject,
      week_compare_rupees: byWeek,
      budgets: budgets.filter((b) => b.month === mk).map((b) => ({
        category: b.category || 'overall', budget_rupees: Number(b.amount) / 100,
      })),
      biggest_recent_expenses: list.filter((t) => t.type === 'expense')
        .sort((a, b) => b.amount - a.amount).slice(0, 5)
        .map((t) => ({ note: t.note || t.category, category: t.category, rupees: t.amount / 100, project: t.project || undefined })),
      entry_count: list.length,
    };
  };

  const value = {
    token, email, booted, txs, budgets, accounts, syncState, lastSync, toastMsg,
    api, toast, syncNow, saveTx, saveBudget, saveAccounts, authenticate, logout,
    live, totals, inMonth, catSpend, effectiveBudget, projects, accountBalances, buildSummary,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
