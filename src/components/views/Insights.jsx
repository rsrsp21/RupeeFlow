'use client';
// AI hub — health score/coach cards, weekly narrative, and ask-anything chat.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, TrendingDown, AlertTriangle, Trophy, Eye, RefreshCw, RotateCcw, Send, Gauge, ScrollText } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { loadDaily, saveDaily, clearDaily } from '@/lib/client/dailyCache';
import Markdown from '../Markdown';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';

const KIND_META = {
  save: { icon: TrendingDown, tone: 'save', label: 'Save' },
  risk: { icon: AlertTriangle, tone: 'risk', label: 'Risk' },
  win: { icon: Trophy, tone: 'win', label: 'Win' },
  watch: { icon: Eye, tone: 'watch', label: 'Watch' },
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

  async function runCoach() {
    setLoadingCoach(true);
    try {
      const out = await store.api('/ai/coach', {
        method: 'POST', body: JSON.stringify({ summary: store.buildSummary(60) }),
      });
      setCoach(out);
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
        <div className="view-head-utils"><SyncBadge /><SettingsLink /></div>
      </header>

      {!hasData && <div className="card"><p className="empty">Add a few entries first. AI analysis needs data to work from.</p></div>}

      {hasData && (
        <>
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

                  <div className="coach-grid">
                    {(coach.cards || []).map((c, i) => {
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
