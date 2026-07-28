'use client';
// Add/edit/delete an entry. Deletes are soft (deleted=1) and every edit bumps
// rev + updated_at, so history stays consistent on every synced device.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, ACCOUNTS, AUTO_RULES, rupees, toPaise } from '@/lib/client/constants';
import { normalizeNote } from '@/lib/noteMatch';
import CategoryIcon from '../CategoryIcon';

export const backdropMotion = {
  initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
  transition: { duration: 0.15 },
};
export const panelMotion = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
  transition: { type: 'spring', stiffness: 420, damping: 34 },
};

export default function TxModal({ state, onClose }) {
  const store = useStore();
  const existing = state.id ? store.txs[state.id] : null;
  const pre = state.prefill || {};

  const [type, setType] = useState(existing?.type || pre.type || 'expense');
  const [amount, setAmount] = useState(existing ? existing.amount / 100 : pre.amount ? pre.amount / 100 : '');
  const [note, setNote] = useState(existing?.note ?? pre.note ?? '');
  const [category, setCategory] = useState(existing?.category || pre.category || 'Food & Dining');
  const [project, setProject] = useState(existing?.project ?? pre.project ?? '');
  const [account, setAccount] = useState(existing?.account || store.accounts[0] || 'Cash');
  const [toAccount, setToAccount] = useState(existing?.to_account || store.accounts[1] || 'Bank');
  const [date, setDate] = useState(() => {
    const d = new Date(Number(existing?.occurred_at ?? pre.occurred_at ?? Date.now()));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [noteFocused, setNoteFocused] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  // note history, keyed by normalized text (quantity/units stripped) so
  // "chicken 300g" and "chicken 300 grams" resolve to the same past entry
  const history = useMemo(() => store.noteHistory(), [store.txs]); // eslint-disable-line react-hooks/exhaustive-deps
  const historyIndex = useMemo(() => new Map(history.map((h) => [h.key, h])), [history]);
  const noteKey = normalizeNote(note);
  const matches = useMemo(() => {
    if (existing || noteKey.length < 2) return [];
    return history.filter((h) => h.key !== noteKey && h.key.includes(noteKey)).slice(0, 5);
  }, [history, noteKey, existing]);

  // auto-fill category (and project) from the user's own history first, since
  // it reflects what they actually picked before; fall back to keyword rules
  useEffect(() => {
    if (existing) return;
    const hit = noteKey && historyIndex.get(noteKey);
    if (hit) {
      setCategory(hit.category);
      if (hit.project) setProject((p) => p || hit.project);
      return;
    }
    for (const [re, cat] of AUTO_RULES) if (re.test(note)) { setCategory(cat); break; }
  }, [note, noteKey, existing, historyIndex]);

  function pickSuggestion(m) {
    setNote(m.note);
    setCategory(m.category);
    if (m.project) setProject((p) => p || m.project);
    setAmount((a) => (a === '' ? String(m.amount / 100) : a));
    setNoteFocused(false);
  }

  async function aiCategorize() {
    const v = note.trim();
    if (!v || aiBusy) return;
    setAiBusy(true);
    try {
      const out = await store.api('/ai/categorize', {
        method: 'POST',
        body: JSON.stringify({ note: v, history: history.slice(0, 40).map((h) => ({ note: h.note, category: h.category, project: h.project })) }),
      });
      if (out?.category && CATEGORIES[out.category]) { setCategory(out.category); store.toast(`Categorized as ${out.category}`); }
      else store.toast('Could not determine a category');
    } catch (e) { store.toast('AI categorize failed: ' + e.message); }
    setAiBusy(false);
  }

  async function save(e) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!Number.isFinite(paise) || paise <= 0) return store.toast('Enter a valid amount');
    if (type === 'transfer' && account === toAccount) return store.toast('Pick two different accounts');
    const base = existing ? new Date(Number(existing.occurred_at)) : new Date();
    const [y, m, d] = date.split('-').map(Number);
    const occurred = new Date(y, m - 1, d, base.getHours(), base.getMinutes()).getTime();
    const t = {
      id: existing?.id || crypto.randomUUID(),
      type, amount: paise,
      category: type === 'transfer' ? 'Other' : category,
      note: note.trim(), project: project.trim(),
      account, to_account: type === 'transfer' ? toAccount : '',
      occurred_at: occurred,
      created_at: existing?.created_at || Date.now(),
      updated_at: Date.now(),
      rev: (existing?.rev || 0) + 1,
      deleted: 0,
      source: existing?.source || pre.source || 'manual',
    };
    await store.saveTx(t);
    onClose();
    store.toast(existing ? 'Entry updated ✓' : `Added ${rupees(paise)} ✓`);
  }

  async function remove() {
    await store.saveTx({ ...existing, deleted: 1, updated_at: Date.now(), rev: existing.rev + 1 });
    onClose();
    store.toast('Entry deleted, totals recalculated');
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3>{existing ? 'Edit entry' : 'Add entry'}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={save}>
          <div className="seg">
            {['expense', 'income', 'transfer'].map((t) => (
              <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="amount-input">
            <span>₹</span>
            <input inputMode="decimal" placeholder="0" required autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="note-field">
            <input placeholder="What was it? (auto-fills from past entries)" autoComplete="off"
              value={note} onChange={(e) => setNote(e.target.value)}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setTimeout(() => setNoteFocused(false), 120)} />
            {type !== 'transfer' && (
              <button type="button" className="note-ai-btn" onClick={aiCategorize}
                disabled={aiBusy || !note.trim()} title="Auto-categorize with AI">
                <Sparkles size={13} className={aiBusy ? 'spin' : ''} />
              </button>
            )}
            {noteFocused && matches.length > 0 && (
              <ul className="note-suggest">
                {matches.map((m) => (
                  <li key={m.key} onMouseDown={() => pickSuggestion(m)}>
                    <CategoryIcon category={m.category} size={12} />
                    <span className="note-suggest-text">{m.note}</span>
                    <em>{m.category}{m.project ? ` · ${m.project}` : ''}</em>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="form-row">
            {type !== 'transfer' && (
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}
              </select>
            )}
            <input list="rf-projects" placeholder="Project / label"
              value={project} onChange={(e) => setProject(e.target.value)} />
            <datalist id="rf-projects">
              {store.projects().map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="form-row labelled">
            <label>
              <span>{type === 'transfer' ? 'From account' : type === 'income' ? 'Into account' : 'Paid from'}</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)}>
                {store.accounts.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            {type === 'transfer' && (
              <label>
                <span>To account</span>
                <select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
                  {store.accounts.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <div className="btn-row">
            {existing && <button type="button" className="btn danger-ghost" onClick={remove}>Delete</button>}
            <button type="submit" className="btn primary grow">Save</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
