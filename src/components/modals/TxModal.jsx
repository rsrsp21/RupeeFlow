'use client';
// Add/edit/delete an entry. Deletes are soft (deleted=1) and every edit bumps
// rev + updated_at, so history stays consistent on every synced device.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, ACCOUNTS, AUTO_RULES, rupees, toPaise } from '@/lib/client/constants';

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

  // auto-categorize as you type (new entries only)
  useEffect(() => {
    if (existing) return;
    for (const [re, cat] of AUTO_RULES) if (re.test(note)) { setCategory(cat); break; }
  }, [note, existing]);

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
          <input placeholder="What was it? (auto-categorizes as you type)"
            value={note} onChange={(e) => setNote(e.target.value)} />
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
