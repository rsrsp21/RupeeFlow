'use client';
// AI hub — health score/coach cards, weekly narrative, and ask-anything chat.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, TrendingDown, AlertTriangle, Trophy, Eye, CreditCard, PiggyBank, Wallet, Timer, RefreshCw, RotateCcw, Send, Gauge, ScrollText, Tag, TrendingUp, CalendarClock, Receipt, ArrowUpRight, ArrowDownRight, LineChart } from 'lucide-react';
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
import {
  monthOverMonth, categoryDeltas, projectMonthEnd, weekdayPattern,
  priceDrift, missingRecurring, outliers, monthlyTrend,
} from '@/lib/analytics.mjs';
import { normalizeNote } from '@/lib/noteMatch';

const KIND_META = {
  save: { icon: TrendingDown, tone: 'save', label: 'Save' },
  risk: { icon: AlertTriangle, tone: 'risk', label: 'Risk' },
  win: { icon: Trophy, tone: 'win', label: 'Win' },
  watch: { icon: Eye, tone: 'watch', label: 'Watch' },
  debt: { icon: CreditCard, tone: 'risk', label: 'Debt' },
};

const CHIPS = [
  'Where did I spend the most this month?',
  'Which expenses look unnecessary?',
  'How am I doing against my budget?',
  'Compare this month with last month',
  'How much can I realistically save?',
  // The assistant can query individual entries now, so the suggestions
  // should show that off rather than staying at category level.
  'What did I spend on chicken last month?',
  'Which shop do I buy from most often?',
];

export default function Insights() {
  const store = useStore();
  const { setView } = useUI();
  // Cached until local midnight — switching views (or reopening the app)
  // shouldn't throw away an analysis that already cost an API call.
  const [coach, setCoach] = useState(() => loadDaily('rf_ai_coach'));
  const [loadingCoach, setLoadingCoach] = useState(false);
  const [weekly, setWeekly] = useState(() => loadDaily('rf_ai_weekly') || '');
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [chat, setChat] = useState(() => loadDaily('rf_ai_chat') || []);
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
  const local = (() => {
    const txs = store.live();
    const now = Date.now();
    return {
      mom: monthOverMonth(txs, now),
      cats: categoryDeltas(txs, now),
      projection: projectMonthEnd(txs, now),
      weekday: weekdayPattern(txs, now),
      drift: priceDrift(txs, normalizeNote, now),
      missing: missingRecurring(txs, normalizeNote, now),
      spikes: outliers(txs, now),
      trend: monthlyTrend(txs, now, 6),
    };
  })();

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
    clearDaily('rf_ai_chat');
    store.toast('Chat cleared');
  }

  async function ask(q) {
    if (asking) return;
    setAsking(true);
    setChat((c) => [...c, { who: 'me', text: q }, { who: 'ai', text: '', pending: true }]);
    try {
      const { answer } = await store.api('/ai/ask', {
        method: 'POST', body: JSON.stringify({ question: q, summary: store.buildSummary(120) }),
      });
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { who: 'ai', text: answer } : m)));
    } catch (e) {
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { who: 'ai', text: 'Could not reach AI: ' + e.message } : m)));
    }
    setAsking(false);
  }

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2><Sparkles size={19} strokeWidth={2} /> AI Insights</h2>
          <p className="sub">Analysis grounded in your actual entries</p>
        </div>
        <div className="view-head-utils"><SyncBadge /><MoneyLink /><SettingsLink /></div>
      </header>

      {!hasData && <div className="card"><p className="empty">Add a few entries first. AI analysis needs data to work from.</p></div>}

      {hasData && (
        <>
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
              <h3><LineChart size={13} style={{ verticalAlign: '-2px' }} /> This month so far</h3>
              <span className="muted small">vs first {local.mom.daysCompared} days last month</span>
            </div>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-k">Spent</span>
                <b className="stat-v">{rupees(local.mom.current)}</b>
                {local.mom.pct !== null && (
                  <span className="stat-sub" style={{ color: local.mom.delta > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {local.mom.delta > 0 ? '▲' : '▼'} {Math.abs(local.mom.pct)}% vs {rupees(local.mom.previous)}
                  </span>
                )}
              </div>
              {local.projection.projected !== null && (
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

            {local.cats.length > 0 && (
              <>
                <div className="card-head" style={{ marginTop: 14 }}><h3>What moved</h3></div>
                <div className="delta-list">
                  {local.cats.map((c) => (
                    <div className="delta-row" key={c.category}>
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
          </div>

          {/* ── 6-month shape: whether things are actually improving ── */}
          {local.trend.some((m) => m.expense > 0 || m.income > 0) && (
            <div className="card">
              <div className="card-head"><h3>Last 6 months</h3></div>
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
              <div className="card-head"><h3>Worth a look</h3></div>
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

          {/* ── chat ── */}
          <div className="card">
            <div className="card-head">
              <h3><Sparkles size={13} style={{ verticalAlign: '-2px' }} /> Ask anything</h3>
              {chat.length > 0 && (
                <button className="btn ghost sm" onClick={restartChat} disabled={asking} title="Start a new conversation">
                  <RotateCcw size={13} /> Restart
                </button>
              )}
            </div>
            {chat.length > 0 && (
              <div className="chat">
                {chat.map((m, i) => (
                  <motion.div key={i} className={`bubble ${m.who}`}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                    {m.pending ? <span className="typing"><i /><i /><i /></span>
                      : m.who === 'ai' ? <Markdown text={m.text} /> : m.text}
                  </motion.div>
                ))}
              </div>
            )}
            <form className="ask-row" onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (v) { ask(v); setInput(''); } }}>
              <input placeholder="Ask about your spending…" value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="btn primary" type="submit" disabled={asking}><Send size={15} /></button>
            </form>
            <div className="chips">
              {CHIPS.map((c) => <button key={c} className="chip" onClick={() => ask(c)}>{c}</button>)}
            </div>
          </div>
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
