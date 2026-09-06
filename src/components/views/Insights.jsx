'use client';
// AI hub — health score/coach cards, weekly narrative, and ask-anything chat.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, TrendingDown, AlertTriangle, Trophy, Eye, CreditCard, PiggyBank, Wallet, Timer, RefreshCw, RotateCcw, Send, Gauge, ScrollText, Tag, TrendingUp, CalendarClock, Receipt, ArrowUpRight, ArrowDownRight, LineChart, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { loadDaily, saveDaily, clearDaily } from '@/lib/client/dailyCache';
import { useUI } from '../App';
import Markdown from '../Markdown';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import MoneyLink from '../MoneyLink';
import TrendBars from '../charts/TrendBars';
import CategoryIcon from '../CategoryIcon';
import AccountIcon from '../AccountIcon';
import {
  monthOverMonth, categoryDeltas, projectMonthEnd, weekdayPattern,
  priceDrift, missingRecurring, outliers, monthlyTrend, spanSummary, categoryBreakdown, accountSpending, cardHealth,
} from '@/lib/analytics.mjs';
import { normalizeNote } from '@/lib/noteMatch';
import { applyParsedTransactions } from '@/lib/client/applyParsed';
import {
  listen, stopListening, speak, stopSpeaking, pickVoice, onVoicesReady,
  speechInSupported, speechOutSupported,
} from '@/lib/client/speech';

const KIND_META = {
  save: { icon: TrendingDown, tone: 'save', label: 'Save' },
  risk: { icon: AlertTriangle, tone: 'risk', label: 'Risk' },
  win: { icon: Trophy, tone: 'win', label: 'Win' },
  watch: { icon: Eye, tone: 'watch', label: 'Watch' },
  debt: { icon: CreditCard, tone: 'risk', label: 'Debt' },
};

// Short labels, full question. Seven long chips wrapped to four or five rows
// in the sheet and read as clutter; the label is what fits on a chip, the
// question is what the assistant is actually asked.
const CHIPS = [
  ['Top spending', 'Where did I spend the most this month?'],
  ['Vs last month', 'Compare this month with last month'],
  ['Budget', 'How am I doing against my budget?'],
  ['Cut back', 'Which expenses look unnecessary?'],
  ['Can I save?', 'How much can I realistically save?'],
];

export default function Insights() {
  const store = useStore();
  const { setView, openLedgerWith } = useUI();
  // Cached until local midnight — switching views (or reopening the app)
  // shouldn't throw away an analysis that already cost an API call.
  const [coach, setCoach] = useState(() => loadDaily('rf_ai_coach'));
  const [loadingCoach, setLoadingCoach] = useState(false);
  const [weekly, setWeekly] = useState(() => loadDaily('rf_ai_weekly') || '');
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [chat, setChat] = useState(() => loadDaily('rf_ai_chat') || []);
  // Which month the local analysis is about. '' means the current month, and
  // stays the default so the screen still opens on "now" — looking back is a
  // deliberate act, not something you land in.
  const [month, setMonth] = useState('');
  // The full category list can run long, so it is collapsed by default and
  // expanded on demand rather than pushing everything else off the screen.
  const [showAllCats, setShowAllCats] = useState(false);
  // Nine stacked cards was a long scroll to reach anything specific. Grouped
  // into tabs by the question each answers: where I stand, where it goes, and
  // what the AI makes of it. Kept in state rather than the URL — it is a view
  // preference, not a destination worth restoring or sharing.
  const [tab, setTab] = useState('overview');
  // Chat is the thing people reach for most, so it opens over the screen from
  // anywhere here rather than living at the bottom of one tab.
  const [chatOpen, setChatOpen] = useState(false);
  // Voice in and out for the chat. `speakBack` is remembered, so someone who
  // wants answers read aloud does not have to re-enable it every question.
  const [listening, setListening] = useState(false);
  const [speakBack, setSpeakBack] = useState(() => {
    try { return localStorage.getItem('rf_chat_voice') === '1'; } catch { return false; }
  });
  const voiceRef = useRef(null);
  // Which answer is being read aloud, so its own button can show a stop state.
  const [speakingIdx, setSpeakingIdx] = useState(null);
  // A part-built entry the assistant is still collecting details for. Held
  // here rather than on the server so the conversation survives a failed
  // request, and cleared the moment it is saved or the chat is restarted.
  const [pendingEntry, setPendingEntry] = useState(null);
  // The controls stick BELOW the sticky header, so they need its height as an
  // offset. It varies (subtitle length, wrapping, font scaling), so it is
  // measured rather than hardcoded — a fixed guess left them sliding behind
  // the header on some screens and floating below it on others.
  const headRef = useRef(null);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;
    const apply = () => el.parentElement?.style.setProperty('--head-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => onVoicesReady((v) => { voiceRef.current = v; }), []);
  useEffect(() => {
    try { localStorage.setItem('rf_chat_voice', speakBack ? '1' : '0'); } catch { /* private mode */ }
  }, [speakBack]);
  // Nothing should keep talking or listening after the sheet is closed.
  useEffect(() => {
    if (chatOpen) return;
    stopListening(); stopSpeaking(); setListening(false); setSpeakingIdx(null);
  }, [chatOpen]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => { if (coach) saveDaily('rf_ai_coach', coach); }, [coach]);
  useEffect(() => { if (weekly) saveDaily('rf_ai_weekly', weekly); }, [weekly]);
  useEffect(() => { if (chat.length && !chat[chat.length - 1]?.pending) saveDaily('rf_ai_chat', chat); }, [chat]);

  const hasData = store.live().length > 0;

  // Same numbers the AI is handed, shown directly — a summary the user can
  // check the AI's claims against rather than having to trust them.
  const health = (() => {
    const w = store.netWorth();
    const s2 = store.buildSummary(35);
    const stale = (s2.holdings || []).filter((h) => h.valued_days_ago === null || h.valued_days_ago > 30).length;
    // Runway: how long the spendable balance lasts at the recent burn rate.
    // A balance on its own says nothing — this is the number that makes it
    // mean something, and it needs no data the app isn't already computing.
    const since7 = Date.now() - 7 * 86400000;
    const dailyBurn = Math.round(store.live()
      .filter((t) => t.type === 'expense' && t.occurred_at >= since7)
      .reduce((a, t) => a + t.amount, 0) / 7);
    return {
      dailyBurn,
      runwayDays: dailyBurn > 0 ? Math.floor(Math.max(0, w.spendable) / dailyBurn) : null,
      spendable: Math.round(w.spendable), invested: Math.round(w.invested), dues: Math.round(w.dues), owed: Math.round(w.owed),
      // Calendar-month AND trailing-30-day. Pay lands on the last working day
      // and is usually saved the same day, so on the 1st-3rd the calendar
      // figure is 0 while the money has in fact just been moved — showing
      // that 0 next to a "25% of 30-day income" subtitle read as broken,
      // because the two described different windows.
      saved: Math.round((s2.month_invested_rupees || 0) * 100),
      saved30: Math.round((s2.invested_last_30d_rupees || 0) * 100),
      rate: s2.savings_rate_pct, stale,
      lastIncome: s2.last_income,
      groups: s2.groups || [],
    };
  })();

  // Deterministic analysis, computed from the ledger with no API call — so
  // the screen is useful the moment it opens rather than after a round trip,
  // and every claim here is checkable against the user's own entries.
  // Months the user actually has entries in, newest first — no point offering
  // a month with nothing in it.
  const monthOptions = (() => {
    const seen = new Map();
    for (const t of store.live()) {
      const d = new Date(Number(t.occurred_at));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) seen.set(key, d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
    }
    return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  })();

  // Calendar years the user has entries in — offered alongside rolling spans
  // because "2026" and "the last 12 months" are different questions, and at
  // year end it is the calendar one people mean.
  const yearOptions = [...new Set(store.live()
    .map((t) => new Date(Number(t.occurred_at)).getFullYear()))].sort((a, b) => b - a);

  // A span selection is "last N months"; a year selection is "y:YYYY"; a bare
  // YYYY-MM is one month. Kept as one string so the picker stays a single
  // control rather than a mode switch plus a value.
  const SPANS = [['s:3', 'Last 3 months'], ['s:6', 'Last 6 months'], ['s:12', 'Last 12 months']];
  const spanMonths = month.startsWith('s:') ? Number(month.slice(2)) : null;
  const yearPicked = month.startsWith('y:') ? Number(month.slice(2)) : null;

  const local = (() => {
    const txs = store.live();
    // Analysing a past month means anchoring to the END of it, not to today:
    // every one of these functions measures backwards from the instant given,
    // so passing "now" would compare that month against the wrong windows and
    // silently include entries made after it. The last millisecond of the
    // chosen month is the honest anchor. The current month still uses the real
    // clock, so a part-month stays a part-month.
    const now = (() => {
      if (!month) return Date.now();
      // A rolling span ends now; a calendar year ends with December (or today,
      // if that year is still running).
      if (spanMonths) return Date.now();
      if (yearPicked) return Math.min(new Date(yearPicked + 1, 0, 1).getTime() - 1, Date.now());
      const [y, m] = month.split('-').map(Number);
      return Math.min(new Date(y, m, 1).getTime() - 1, Date.now());
    })();

    // How many whole months the view covers. A single month is 1; the span
    // options say so outright; a calendar year is 12 (fewer while it runs).
    const coverMonths = spanMonths
      || (yearPicked
        ? (yearPicked === new Date().getFullYear() ? new Date().getMonth() + 1 : 12)
        : 1);
    const span = coverMonths > 1 ? spanSummary(txs, now, coverMonths, Date.now()) : null;

    // Full category breakdown over whatever window is selected. The span
    // carries its own bounds; a single month derives them from the anchor.
    const bounds = (() => {
      if (span) {
        const prevStart = new Date(new Date(span.start).getFullYear(),
          new Date(span.start).getMonth() - span.months, 1).getTime();
        return { start: span.start, end: span.end, prevStart, prevEnd: span.start - 1 };
      }
      const d = new Date(now);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      // A part-month is compared with the same elapsed days of the month
      // before, matching monthOverMonth rather than contradicting it.
      return { start, end: now, prevStart, prevEnd: prevStart + (now - start) };
    })();
    const breakdown = categoryBreakdown(txs, bounds.start, bounds.end, bounds.prevStart, bounds.prevEnd);
    // Which account or card the money actually left from — a dimension none of
    // the category views can show.
    const byAccount = accountSpending(txs, store.accounts, bounds.start, bounds.end, bounds.prevStart, bounds.prevEnd);
    const cards = cardHealth(store.accounts, store.accountBalances(), txs, Date.now());

    return {
      span,
      breakdown,
      byAccount,
      cards,
      bounds,
      coverMonths,
      mom: monthOverMonth(txs, now),
      cats: categoryDeltas(txs, now),
      projection: projectMonthEnd(txs, now),
      weekday: weekdayPattern(txs, now),
      drift: priceDrift(txs, normalizeNote, now),
      missing: missingRecurring(txs, normalizeNote, now),
      spikes: outliers(txs, now),
      // The chart follows the span, so a year view shows twelve bars rather
      // than six of them.
      trend: monthlyTrend(txs, now, Math.max(6, Math.min(24, coverMonths))),
      now,
      isPast: Boolean(month),
    };
  })();

  // Open Ledger showing exactly the entries behind a figure on this screen.
  // Uses the same window the analysis used, so the total there matches the
  // total here — a drill-down that disagreed with the number it came from
  // would be worse than no drill-down.
  const iso = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const openAccount = (account) => openLedgerWith({
    account,
    from: iso(local.bounds.start),
    to: iso(local.bounds.end),
  });
  const openCategory = (category) => openLedgerWith({
    category,
    from: iso(local.bounds.start),
    to: iso(local.bounds.end),
    type: 'expense', // these breakdowns are spending-only
  });

  async function runCoach() {
    setLoadingCoach(true);
    try {
      const out = await store.api('/ai/coach', {
        method: 'POST', body: JSON.stringify({ summary: store.buildSummary(60) }),
      });
      // Gemini occasionally returns a card with nothing in it, which renders
      // as an empty bordered tile. Drop anything without real content before
      // it's stored, so the cached copy is clean too.
      setCoach({
        ...out,
        cards: (out?.cards || []).filter((c) => c && (String(c.title || '').trim() || String(c.detail || '').trim())),
        // Stamped so a score computed before today's entries can say so
        // instead of quietly presenting itself as current.
        txCount: store.live().length,
      });
    } catch (e) { store.toast('Analysis failed: ' + e.message); }
    setLoadingCoach(false);
  }

  async function runWeekly() {
    setLoadingWeekly(true);
    try {
      const { insight } = await store.api('/ai/insights', {
        method: 'POST', body: JSON.stringify({ summary: store.buildSummary() }),
      });
      setWeekly(insight);
    } catch (e) { setWeekly('Could not generate: ' + e.message); }
    setLoadingWeekly(false);
  }

  // The saving effect below skips empty chats (so a fresh load doesn't wipe
  // a cached conversation), which means resetting state alone would leave the
  // old thread to reappear on the next visit — the cache has to go too.
  function restartChat() {
    setChat([]);
    setInput('');
    setPendingEntry(null);
    clearDaily('rf_ai_chat');
    store.toast('Chat cleared');
  }

  // Dictation fills the input as you speak and sends on the final result, so
  // a spoken question needs no second tap to submit.
  function toggleMic() {
    if (listening) { stopListening(); setListening(false); return; }
    stopSpeaking(); // don't transcribe our own playback
    setListening(true);
    listen({
      onResult: (text, isFinal) => {
        setInput(text);
        if (isFinal && text) { setInput(''); ask(text); }
      },
      onEnd: () => setListening(false),
      onError: (e) => { setListening(false); store.toast(e.message); },
    });
  }

  // Saves a completed entry and reports back. Reuses applyParsedTransactions,
  // which already knows how an "invest" becomes a transfer into a holding and
  // how to resolve categories, groups and account names — the chat should not
  // grow a second, subtly different way of writing a transaction.
  async function commitEntry(entry, confirmText) {
    try {
      const { added } = await applyParsedTransactions(
        store, { transactions: [entry] }, 'ai-chat',
        { today: new Date().toISOString().slice(0, 10) },
      );
      if (!added) throw new Error('nothing was recorded');
      setPendingEntry(null);
      return confirmText || 'Added it.';
    } catch (e) {
      setPendingEntry(null);
      return `Could not save that: ${e.message}`;
    }
  }

  async function ask(q) {
    if (asking) return;
    setAsking(true);
    setChat((c) => [...c, { who: 'me', text: q }, { who: 'ai', text: '', pending: true }]);
    try {
      // Recording is tried first: a message that states a spend is an
      // instruction, and answering it with an analysis would silently drop it.
      // The route replies intent:"ask" for anything that is really a question,
      // and for an entry it cannot make sense of.
      const entryOut = await store.api('/ai/chat-entry', {
        method: 'POST',
        body: JSON.stringify({
          message: q,
          pending: pendingEntry,
          history: store.noteHistory(),
          customCategories: store.customCategories.map((c) => c.name),
          holdings: store.holdings.map((h) => h.name),
          accounts: store.accounts.map((a) => a.name),
          groups: store.groupNames(),
          today: new Date().toISOString().slice(0, 10),
        }),
      }).catch(() => null);

      if (entryOut?.intent === 'add') {
        const text = entryOut.ready
          ? await commitEntry(entryOut.entry, entryOut.reply)
          : (setPendingEntry(entryOut.entry), entryOut.reply);
        let idx = -1;
        setChat((c) => { idx = c.length - 1; return c.map((m, i) => (i === idx ? { who: 'ai', text } : m)); });
        if (speakBack) {
          const u = speak(text, voiceRef.current);
          if (u) { setSpeakingIdx(idx); u.onend = () => setSpeakingIdx((cur) => (cur === idx ? null : cur)); }
        }
        setAsking(false);
        return;
      }

      const { answer } = await store.api('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({
          question: q, summary: store.buildSummary(120),
          today: new Date().toISOString().slice(0, 10),
        }),
      });
      // The answer always replaces the trailing pending bubble, so its index
      // is captured here rather than read back out of a state updater.
      let answerIdx = -1;
      setChat((c) => {
        answerIdx = c.length - 1;
        return c.map((m, i) => (i === answerIdx ? { who: 'ai', text: answer } : m));
      });
      if (speakBack) {
        const u = speak(answer, voiceRef.current);
        // Tracked so the bubble's own button shows a stop state while the
        // auto-read plays, instead of the two disagreeing.
        if (u) {
          setSpeakingIdx(answerIdx);
          u.onend = () => setSpeakingIdx((cur) => (cur === answerIdx ? null : cur));
        }
      }
    } catch (e) {
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { who: 'ai', text: 'Could not reach AI: ' + e.message } : m)));
    }
    setAsking(false);
  }

  return (
    <section className="view">
      <header className="view-head" ref={headRef}>
        <div>
          <h2><Sparkles size={19} strokeWidth={2} /> Insights</h2>
          <p className="sub">Analysis grounded in your actual entries</p>
        </div>
        <div className="view-head-utils"><SyncBadge /><MoneyLink /><SettingsLink /></div>
      </header>

      {!hasData && <div className="card"><p className="empty">Add a few entries first. There's nothing to analyse yet.</p></div>}

      {hasData && (
        <>
          {/* The period scopes every tab, so it sits above them rather than
              inside one card — on Overview the trend and findings follow it
              too, and a control that lived in another tab would leave that
              looking unchangeable. */}
          {/* Period, Ask and the tabs pin together as one strip. Wrapped
              rather than made sticky individually, because a sticky child
              needs to know the header's height to offset against and that
              varies by screen — one container just stacks after it. */}
          <div className="insights-controls">
          <div className="period-row">
            {monthOptions.length > 1 && (<>
              <span className="muted small">Analysing</span>
              <select className="month-pick" value={month} onChange={(e) => setMonth(e.target.value)}
                aria-label="Period to analyse">
                <option value="">This month</option>
                <optgroup label="Rolling">
                  {SPANS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </optgroup>
                {yearOptions.length > 0 && (
                  <optgroup label="Calendar year">
                    {yearOptions.map((y) => <option key={y} value={`y:${y}`}>{y}</option>)}
                  </optgroup>
                )}
                <optgroup label="Month">
                  {monthOptions.filter(([k]) => k !== monthOptions[0][0] || month !== '').map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </optgroup>
              </select>
            </>)}
            {/* Ask sits at the end of this row rather than floating over the
                screen — it was colliding with the add-entry FAB, and this is
                the row people are already looking at. */}
            <button className="chat-fab" onClick={() => setChatOpen(true)} title="Ask about your money">
              <Sparkles size={15} strokeWidth={2} />
              <span>Ask</span>
            </button>
          </div>

          <div className="tab-bar" role="tablist">
            {[['overview', 'Overview'], ['breakdown', 'Breakdown'], ['coach', 'Coach']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k}
                className={`tab-btn ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          </div>

          {tab === 'overview' && (<>
          {/* Derived locally, so the screen says something useful before any
              AI call finishes — and gives the cards below real context. */}
          <div className="card">
            <div className="card-head"><h3>Where you stand</h3></div>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-k"><Wallet size={12} /> Spendable</span>
                <b className="stat-v">{rupees(health.spendable)}</b>
              </div>
              <div className="stat">
                <span className="stat-k"><PiggyBank size={12} /> Invested</span>
                <b className="stat-v" style={{ color: 'var(--green)' }}>{rupees(health.invested)}</b>
              </div>
              {health.dues > 0 && (
                <div className="stat">
                  <span className="stat-k"><CreditCard size={12} /> Card dues</span>
                  <b className="stat-v" style={{ color: 'var(--red)' }}>{rupees(health.dues)}</b>
                </div>
              )}
              {health.owed > 0 && (
                <div className="stat">
                  <span className="stat-k">Owed to you</span>
                  <b className="stat-v" style={{ color: 'var(--green)' }}>{rupees(health.owed)}</b>
                </div>
              )}
              <div className="stat">
                <span className="stat-k"><Timer size={12} /> Runway</span>
                <b className="stat-v" style={{ color: health.runwayDays === null ? 'var(--muted)'
                  : health.runwayDays < 14 ? 'var(--red)' : health.runwayDays < 30 ? 'var(--text)' : 'var(--green)' }}>
                  {/* Past a few months the precision is noise, so it caps. */}
                  {health.runwayDays === null ? '—'
                    : health.runwayDays > 90 ? '90+ days'
                    : `${health.runwayDays} ${health.runwayDays === 1 ? 'day' : 'days'}`}
                </b>
                {health.dailyBurn > 0 && <span className="stat-sub">{rupees(health.dailyBurn)} a day</span>}
              </div>
              <div className="stat">
                {/* Label follows the figure: if this month is empty but the
                    last 30 days aren't, say so rather than reporting a zero
                    that contradicts the line underneath it. */}
                <span className="stat-k">{health.saved > 0 ? 'Saved this month' : 'Saved since last pay'}</span>
                <b className="stat-v" style={{ color: (health.saved || health.saved30) > 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {rupees(health.saved > 0 ? health.saved : health.saved30)}
                </b>
                {/* Only shown when it's a share of income that means
                    something — investing out of last month's balance can put
                    this well over 100%, which reads as a bug rather than a
                    good month. */}
                {health.rate !== null && health.rate > 0 && health.rate <= 100 && (
                  <span className="stat-sub">{health.rate.toFixed(0)}% of 30-day income</span>
                )}
                {health.saved === 0 && health.saved30 === 0 && health.lastIncome && (
                  <span className="stat-sub">
                    Last pay {health.lastIncome.days_ago === 0 ? 'today' : `${health.lastIncome.days_ago}d ago`}
                  </span>
                )}
              </div>
            </div>
            {health.stale > 0 && (
              <p className="muted small" style={{ marginTop: 10 }}>
                {health.stale} {health.stale === 1 ? 'holding' : 'holdings'} not valued in a month — net worth may be stale.
              </p>
            )}
          </div>

          {/* ── this month vs last, on a fair window ── */}
          <div className="card">
            <div className="card-head">
              <h3>
                <LineChart size={13} style={{ verticalAlign: '-2px' }} />
                {' '}{spanMonths ? `Last ${spanMonths} months`
                  : yearPicked ? `${yearPicked}`
                  : local.isPast ? monthOptions.find(([k]) => k === month)?.[1]
                  : 'This month so far'}
              </h3>
            </div>
            <p className="muted small" style={{ marginBottom: 10 }}>
              {local.span
                ? `${local.span.monthsElapsed} ${local.span.monthsElapsed === 1 ? 'month' : 'months'} · compared with the ${local.span.monthsElapsed === 1 ? 'month' : `${local.span.monthsElapsed} months`} before that`
                : local.isPast
                  ? `Full month · compared with the same ${local.mom.daysCompared} days of the month before`
                  : `Compared with the first ${local.mom.daysCompared} days of last month`}
            </p>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-k">Spent</span>
                <b className="stat-v">{rupees(local.span ? local.span.expense : local.mom.current)}</b>
                {(local.span ? local.span.pct : local.mom.pct) !== null && (
                  <span className="stat-sub" style={{
                    color: (local.span ? local.span.delta : local.mom.delta) > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {(local.span ? local.span.delta : local.mom.delta) > 0 ? '▲' : '▼'}{' '}
                    {Math.abs(local.span ? local.span.pct : local.mom.pct)}% vs{' '}
                    {rupees(local.span ? local.span.prevExpense : local.mom.previous)}
                  </span>
                )}
              </div>
              {/* A multi-month view answers different questions than a single
                  month: the useful figures are the monthly rate and what was
                  actually kept, not a projection to the end of one month. */}
              {local.span && (
                <>
                  <div className="stat">
                    <span className="stat-k">Average / month</span>
                    <b className="stat-v">{rupees(local.span.avgPerMonth)}</b>
                    <span className="stat-sub">over {local.span.monthsElapsed} {local.span.monthsElapsed === 1 ? 'month' : 'months'}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-k">Kept</span>
                    <b className="stat-v" style={{ color: local.span.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {local.span.net < 0 ? '−' : ''}{rupees(Math.abs(local.span.net))}
                    </b>
                    <span className="stat-sub">{rupees(local.span.income)} in · {rupees(local.span.expense)} out</span>
                  </div>
                  {local.span.savingsRate !== null && local.span.savingsRate > 0 && (
                    <div className="stat">
                      <span className="stat-k">Saved</span>
                      <b className="stat-v" style={{ color: 'var(--green)' }}>{rupees(local.span.invested)}</b>
                      <span className="stat-sub">{local.span.savingsRate}% of income</span>
                    </div>
                  )}
                  {local.span.topCategory && (
                    <div className="stat">
                      <span className="stat-k">Biggest category</span>
                      <b className="stat-v">{local.span.topCategory.category}</b>
                      <span className="stat-sub">{rupees(local.span.topCategory.current)}</span>
                    </div>
                  )}
                </>
              )}
              {!local.span && !local.isPast && local.projection.projected !== null && (
                <div className="stat">
                  <span className="stat-k">On pace for</span>
                  <b className="stat-v">{rupees(local.projection.projected)}</b>
                  <span className="stat-sub">by month end · {local.projection.daysLeft}d left</span>
                </div>
              )}
              {local.weekday.peak && (
                <div className="stat">
                  <span className="stat-k">Priciest day</span>
                  <b className="stat-v">{local.weekday.peak.name.slice(0, 3)}</b>
                  <span className="stat-sub">{rupees(local.weekday.peak.avg)} on average</span>
                </div>
              )}
            </div>

          </div>

          {/* Trend + findings stay in Overview: they are about the shape of
              things, not about where individual rupees went. */}
          {/* ── 6-month shape: whether things are actually improving ── */}
          {local.trend.some((m) => m.expense > 0 || m.income > 0) && (
            <div className="card">
              <div className="card-head">
                <h3>Last 6 months</h3>
                {local.isPast && <span className="muted small">up to {monthOptions.find(([k]) => k === month)?.[1]}</span>}
              </div>
              <TrendBars buckets={local.trend.map((m) => ({ start: m.key, label: m.label, value: m.expense }))}
                height={64} showValues />
              <div className="month-net-row">
                {local.trend.map((m) => (
                  <span key={m.key} className={m.net >= 0 ? 'pos' : 'neg'}>
                    {m.net >= 0 ? '+' : '−'}{rupees(Math.abs(m.net))}
                  </span>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 6 }}>Bars are spending; the row beneath is what you kept.</p>
            </div>
          )}

          {/* ── things worth acting on, found locally ── */}
          {(local.missing.length > 0 || local.spikes.length > 0 || local.drift.length > 0) && (
            <div className="card">
              <div className="card-head">
                <h3>Worth a look</h3>
                {local.isPast && <span className="muted small">as of that month</span>}
              </div>
              <div className="finding-list">
                {local.missing.map((m) => (
                  <div className="finding" key={`m-${m.item}`}>
                    <CalendarClock size={14} className="finding-icon warn" />
                    <div>
                      <b>{m.item} hasn&apos;t been paid this month</b>
                      <span className="muted small">
                        Paid {m.monthsSeen} months running, typically {rupees(m.typical)} — last seen {m.daysSince} days ago.
                      </span>
                    </div>
                  </div>
                ))}
                {local.spikes.map((o, i) => (
                  <div className="finding" key={`s-${i}`}>
                    <AlertTriangle size={14} className="finding-icon warn" />
                    <div>
                      <b>{o.note} — {o.times}x the usual {o.category}</b>
                      <span className="muted small">
                        {rupees(o.amount)} against a median {rupees(o.median)} across your
                        {' '}{o.sampleSize} {o.category} entries in the last {o.windowDays} days · {o.daysAgo} days ago.
                      </span>
                    </div>
                  </div>
                ))}
                {local.drift.map((d) => (
                  <div className="finding" key={`d-${d.item}`}>
                    {d.pct > 0 ? <TrendingUp size={14} className="finding-icon warn" />
                      : <TrendingDown size={14} className="finding-icon good" />}
                    <div>
                      <b>{d.item} is {Math.abs(d.pct)}% {d.pct > 0 ? 'dearer' : 'cheaper'} than it was</b>
                      <span className="muted small">
                        Averaging {rupees(d.after)}, up from {rupees(d.before)} earlier in the last 6 months.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {health.groups.length > 0 && (
            <div className="card">
              <div className="card-head"><h3><Tag size={13} style={{ verticalAlign: '-2px' }} /> Groups & trips</h3></div>
              <div className="stat-row">
                {health.groups.slice(0, 6).map((g) => (
                  <div className="stat" key={g.name}>
                    <span className="stat-k">{g.name}</span>
                    <b className="stat-v">{rupees(g.total_rupees * 100)}</b>
                    <span className="stat-sub">{g.entries} {g.entries === 1 ? 'entry' : 'entries'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          </>)}

          {tab === 'breakdown' && (<>
          <div className="card">
            <div className="card-head">
              <h3>Where it goes</h3>
              <span className="muted small">
                {spanMonths ? `Last ${spanMonths} months` : yearPicked ? `${yearPicked}`
                  : local.isPast ? monthOptions.find(([k]) => k === month)?.[1] : 'This month'}
              </span>
            </div>
            {/* Two different questions, so two sections. "What moved" answers
                what CHANGED — the short list worth reacting to. "Where it
                went" answers where the money actually goes, including steady
                categories, which the delta list necessarily omits: a constant
                Food & Dining is invisible there precisely because it is
                consistent. */}
            {(local.span ? local.span.cats : local.cats).length > 0 && (
              <>
                <div className="card-head" style={{ marginTop: 14 }}>
                  <h3>What moved</h3>
                  <span className="muted small">vs the period before</span>
                </div>
                <div className="delta-list">
                  {(local.span ? local.span.cats : local.cats).map((c) => (
                    <div className="delta-row tappable" key={c.category} role="button" tabIndex={0}
                      onClick={() => openCategory(c.category)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCategory(c.category); } }}
                      title={`Show ${c.category} entries`}>
                      <CategoryIcon category={c.category} size={14} />
                      <span className="delta-name">{c.category}</span>
                      <span className="delta-amt">{rupees(c.current)}</span>
                      <span className={`delta-chip ${c.delta > 0 ? 'up' : 'down'}`}>
                        {c.delta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {c.isNew ? 'new' : `${Math.abs(c.pct)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {local.breakdown.rows.length > 0 && (
              <>
                <div className="card-head" style={{ marginTop: 14 }}>
                  <h3>Where it went</h3>
                  <span className="muted small">{rupees(local.breakdown.total)} total</span>
                </div>
                <div className="delta-list">
                  {(showAllCats ? local.breakdown.rows : local.breakdown.rows.slice(0, 8)).map((c) => (
                    <div className="delta-row tappable" key={c.category} role="button" tabIndex={0}
                      onClick={() => openCategory(c.category)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCategory(c.category); } }}
                      title={`Show ${c.category} entries`}>
                      <CategoryIcon category={c.category} size={14} />
                      <span className="delta-name">{c.category}</span>
                      <span className="cat-share">{c.share}%</span>
                      <span className="delta-amt">{rupees(c.amount)}</span>
                      {c.delta !== 0 ? (
                        <span className={`delta-chip ${c.delta > 0 ? 'up' : 'down'}`}>
                          {c.delta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                          {c.isNew ? 'new' : `${Math.abs(c.pct)}%`}
                        </span>
                      ) : (
                        // Flat is information too — an empty gap would read as
                        // missing data rather than "unchanged".
                        <span className="delta-chip flat">—</span>
                      )}
                    </div>
                  ))}
                </div>
                {local.breakdown.rows.length > 8 && (
                  <button className="btn ghost sm" style={{ marginTop: 8 }}
                    onClick={() => setShowAllCats((v) => !v)}>
                    {showAllCats ? 'Show top 8' : `Show all ${local.breakdown.rows.length} categories`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── where the money left from ── */}
          {(local.byAccount.length > 0 || local.cards.length > 0) && (
            <div className="card">
              <div className="card-head">
                <h3><CreditCard size={13} style={{ verticalAlign: '-2px' }} /> Accounts &amp; cards</h3>
                <span className="muted small">same period</span>
              </div>

              {local.byAccount.length > 0 && (
                <div className="delta-list">
                  {local.byAccount.map((a) => (
                    <div className="delta-row tappable" key={a.account} role="button" tabIndex={0}
                      onClick={() => openAccount(a.account)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccount(a.account); } }}
                      title={`Show ${a.account} entries`}>
                      <AccountIcon type={a.type} size={13} />
                      <span className="delta-name">{a.account}</span>
                      <span className="cat-share">{a.share}%</span>
                      <span className="delta-amt">{rupees(a.amount)}</span>
                      {a.delta !== 0 && a.pct !== null ? (
                        <span className={`delta-chip ${a.delta > 0 ? 'up' : 'down'}`}>
                          {a.delta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                          {Math.abs(a.pct)}%
                        </span>
                      ) : <span className="delta-chip flat">{a.previous === 0 ? 'new' : '—'}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Cards get their own block: what is owed is a position today,
                  not spending within the selected window, so mixing the two
                  into one row would conflate different things. */}
              {local.cards.length > 0 && (
                <div className="card-sub">
                  {local.cards.map((c) => (
                    <div className="card-health" key={c.account}>
                      <div className="card-health-top">
                        <span className="delta-name">{c.account}</span>
                        <b>{rupees(c.owed)} owed</b>
                      </div>
                      {c.limit ? (
                        <>
                          <div className="util-bar">
                            <span className={`util-fill ${c.status}`}
                              style={{ width: `${Math.min(100, c.utilPct)}%` }} />
                          </div>
                          <span className="muted small">
                            {c.utilPct}% of {rupees(c.limit)} · {rupees(c.available)} available
                            {c.recent30 > 0 && ` · ${rupees(c.recent30)} spent in 30 days`}
                          </span>
                        </>
                      ) : (
                        <span className="muted small">
                          No limit set — add one to track utilisation
                          {c.recent30 > 0 && ` · ${rupees(c.recent30)} spent in 30 days`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          </>)}

          {tab === 'coach' && (<>
          {/* ── health score + coach cards ── */}
          <div className="card">
            <div className="card-head">
              <h3><Gauge size={13} style={{ verticalAlign: '-2px' }} /> Financial health</h3>
              <button className="btn ghost sm" onClick={runCoach} disabled={loadingCoach}>
                <RefreshCw size={13} className={loadingCoach ? 'spin' : ''} />
                {coach ? 'Refresh' : 'Analyse'}
              </button>
            </div>

            {!coach && !loadingCoach && (
              <p className="empty">Run an analysis to get a health score and personalised actions.</p>
            )}
            {coach && !loadingCoach && coach.txCount != null && coach.txCount !== store.live().length && (
              // A cached score is kept until midnight, so entries added since
              // are not in it. Saying so beats showing a stale number as fact.
              <p className="muted small" style={{ marginBottom: 8 }}>
                {Math.abs(store.live().length - coach.txCount)} newer{' '}
                {Math.abs(store.live().length - coach.txCount) === 1 ? 'entry' : 'entries'} since this was run — refresh to include them.
              </p>
            )}
            {loadingCoach && <div className="skeleton-block" />}

            <AnimatePresence>
              {coach && !loadingCoach && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  <div className="score-row">
                    <ScoreRing value={Number(coach.score) || 0} />
                    <div>
                      <div className="score-headline">{coach.headline}</div>
                      <div className="score-reason">{coach.score_reason}</div>
                    </div>
                  </div>

                  <div className="card-head" style={{ marginTop: 4 }}>
                    <h3>What to do</h3>
                    <a href="#" className="link" onClick={(e) => { e.preventDefault(); setView('budgets'); }}>
                      Adjust budgets
                    </a>
                  </div>
                  <div className="coach-grid">
                    {(coach.cards || []).filter((c) => c && (c.title || c.detail)).map((c, i) => {
                      const meta = KIND_META[c.kind] || KIND_META.watch;
                      const Icon = meta.icon;
                      return (
                        <motion.div key={i} className={`coach-card ${meta.tone}`}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.06 }}>
                          <div className="coach-top">
                            <span className="coach-kind"><Icon size={13} strokeWidth={2} /> {meta.label}</span>
                            {c.impact_rupees > 0 && <span className="coach-impact">{rupees(Math.round(c.impact_rupees * 100))}</span>}
                          </div>
                          <div className="coach-title">{c.title}</div>
                          <div className="coach-detail">{c.detail}</div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── weekly narrative ── */}
          <div className="card">
            <div className="card-head">
              <h3><ScrollText size={13} style={{ verticalAlign: '-2px' }} /> Weekly review</h3>
              <button className="btn ghost sm" onClick={runWeekly} disabled={loadingWeekly}>
                <RefreshCw size={13} className={loadingWeekly ? 'spin' : ''} />
                {weekly ? 'Refresh' : 'Generate'}
              </button>
            </div>
            {loadingWeekly ? <div className="skeleton-block short" />
              : weekly ? <div className="insight-card"><Markdown text={weekly} /></div>
              : <p className="empty">A written summary of your week, with one concrete tip.</p>}
          </div>

          </>)}

          {/* ── chat: a sheet over the screen, reachable from every tab,
              because "ask a question" is the thing people come back for and
              it should not be buried at the bottom of one of them. ── */}
          {chatOpen && (
          <div className="chat-sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}>
          <motion.div className="chat-sheet" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}>
            <div className="card-head">
              <h3><Sparkles size={13} style={{ verticalAlign: '-2px' }} /> Ask anything</h3>
              {chat.length > 0 && (
                <button className="btn ghost sm" onClick={restartChat} disabled={asking} title="Start a new conversation">
                  <RotateCcw size={13} /> Restart
                </button>
              )}
              {speechOutSupported() && (
                <button className={`icon-btn ${speakBack ? '' : 'muted-btn'}`}
                  onClick={() => { if (speakBack) stopSpeaking(); setSpeakBack((v) => !v); }}
                  title={speakBack ? 'Answers are read aloud — tap to mute' : 'Read answers aloud'}>
                  {speakBack ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              )}
              <button className="icon-btn" onClick={() => setChatOpen(false)} title="Close">✕</button>
            </div>
            {chat.length > 0 && (
              <div className="chat">
                {chat.map((m, i) => (
                  <motion.div key={i} className={`bubble ${m.who}`}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                    {m.pending ? <span className="typing"><i /><i /><i /></span>
                      : m.who === 'ai' ? <Markdown text={m.text} /> : m.text}
                    {/* Per-answer playback, so a specific reply can be heard
                        again without re-asking. The header toggle governs
                        whether answers speak automatically; this replays one. */}
                    {m.who === 'ai' && !m.pending && m.text && speechOutSupported() && (
                      <button className="bubble-speak"
                        onClick={() => {
                          if (speakingIdx === i) { stopSpeaking(); setSpeakingIdx(null); return; }
                          setSpeakingIdx(i);
                          const u = speak(m.text, voiceRef.current);
                          if (u) u.onend = () => setSpeakingIdx((cur) => (cur === i ? null : cur));
                        }}
                        title={speakingIdx === i ? 'Stop' : 'Read this answer aloud'}>
                        {speakingIdx === i ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      </button>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
            <form className="ask-row" onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (v) { ask(v); setInput(''); } }}>
              <input placeholder={listening ? 'Listening…'
                : pendingEntry ? 'Your answer…'
                : 'Ask, or say what you spent…'}
                value={input} onChange={(e) => setInput(e.target.value)} />
              {speechInSupported() && (
                <button type="button" className={`btn ghost mic-btn ${listening ? 'on' : ''}`}
                  onClick={toggleMic} disabled={asking}
                  title={listening ? 'Stop listening' : 'Ask by voice'}>
                  {listening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}
              <button className="btn primary" type="submit" disabled={asking}><Send size={15} /></button>
            </form>
            <div className="chips">
              {CHIPS.map(([label, q]) => (
                <button key={label} className="chip" title={q} onClick={() => ask(q)}>{label}</button>
              ))}
            </div>
          </motion.div>
          </div>
          )}
        </>
      )}
    </section>
  );
}

function ScoreRing({ value }) {
  const r = 26, circ = 2 * Math.PI * r;
  const tone = value >= 70 ? 'var(--green)' : value >= 45 ? '#d97706' : 'var(--red)';
  return (
    <div className="score-ring">
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          transform="rotate(-90 32 32)"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${(value / 100) * circ} ${circ}` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span className="score-num" style={{ color: tone }}>{value}</span>
    </div>
  );
}
