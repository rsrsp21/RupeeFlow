'use client';
import { useState } from 'react';
import { useStore } from '@/lib/client/store';

const CHIPS = [
  ['Top spends', 'Where did I spend the most this month?'],
  ['Unnecessary?', 'Which of my expenses look unnecessary?'],
  ['Budget check', 'How am I doing against my budget?'],
  ['vs last month', 'Compare this month with last month.'],
];

export default function Insights() {
  const store = useStore();
  const [insight, setInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [chat, setChat] = useState([]); // {who:'me'|'ai', text}
  const [input, setInput] = useState('');

  async function refreshInsight() {
    setLoadingInsight(true);
    try {
      const { insight: text } = await store.api('/ai/insights', {
        method: 'POST', body: JSON.stringify({ summary: store.buildSummary() }),
      });
      setInsight(text);
    } catch (e) { setInsight(`Insight failed: ${e.message}. Are you online?`); }
    setLoadingInsight(false);
  }

  async function ask(q) {
    setChat((c) => [...c, { who: 'me', text: q }, { who: 'ai', text: '…' }]);
    try {
      const { answer } = await store.api('/ai/ask', {
        method: 'POST', body: JSON.stringify({ question: q, summary: store.buildSummary(90) }),
      });
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { who: 'ai', text: answer } : m)));
    } catch (e) {
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { who: 'ai', text: 'Could not reach AI: ' + e.message } : m)));
    }
  }

  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Insights</h2><p className="sub">AI-powered, from your real numbers</p></div>
        <button className="btn ghost" onClick={refreshInsight}>This week</button>
      </header>

      <div className="card insight-card">
        {loadingInsight ? <p className="muted">Analysing your week…</p>
          : insight ? insight
          : <p className="muted">Select “This week” for your AI weekly review.</p>}
      </div>

      <div className="card">
        <h3>Ask anything</h3>
        <div className="chat">
          {chat.map((m, i) => <div key={i} className={`bubble ${m.who}`}>{m.text}</div>)}
        </div>
        <form className="ask-row" onSubmit={(e) => { e.preventDefault(); if (input.trim()) { ask(input.trim()); setInput(''); } }}>
          <input placeholder="e.g. Where do I spend the most? What's unnecessary?"
            value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn primary" type="submit">Ask</button>
        </form>
        <div className="chips">
          {CHIPS.map(([label, q]) => (
            <button key={label} className="chip" onClick={() => ask(q)}>{label}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
