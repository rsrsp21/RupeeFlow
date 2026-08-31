'use client';
// AI hub — health score/coach cards, weekly narrative, and ask-anything chat.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, TrendingDown, AlertTriangle, Trophy, Eye, CreditCard, PiggyBank, Wallet, Timer, RefreshCw, RotateCcw, Send, Gauge, ScrollText, Tag } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { loadDaily, saveDaily, clearDaily } from '@/lib/client/dailyCache';
import { useUI } from '../App';
import Markdown from '../Markdown';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import MoneyLink from '../MoneyLink';

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
      saved: Math.round((s2.month_invested_rupees || 0) * 100),
      rate: s2.savings_rate_pct, stale,
      lastIncome: s2.last_income,
      groups: s2.groups || [],
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
                <span className="stat-k">Saved this month</span>
                <b className="stat-v" style={{ color: health.saved > 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {rupees(health.saved)}
                </b>
                {/* Only shown when it's a share of income that means
                    something — investing out of last month's balance can put
                    this well over 100%, which reads as a bug rather than a
                    good month. */}
                {health.rate !== null && health.rate > 0 && health.rate <= 100 && (
                  <span className="stat-sub">{health.rate.toFixed(0)}% of 30-day income</span>
                )}
                {health.saved === 0 && health.lastIncome && (
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
