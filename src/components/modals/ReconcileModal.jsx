'use client';
// Reconcile an account against reality.
//
// Without this the only way to correct a drifting balance is to edit the
// opening balance until the total looks right — which is how a figure from
// one date ends up wearing another date's label, and how totals come to
// "agree" by construction rather than because each entry is correct. Editing
// the opening balance also silently rewrites history: every past day's
// running total shifts with it.
//
// Entering today's real balance instead records the gap as a normal, dated
// entry. History before it is untouched, the correction is visible in the
// ledger, and you can see when and how much.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Scale } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, toPaise } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function ReconcileModal({ account, onClose }) {
  const store = useStore();
  const current = store.accountBalances()[account.name] || 0;
  const isCard = account.type === 'Credit Card';
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);

  const entered = toPaise(actual);
  // A card's "balance" is stated as what you owe, so it's negative internally.
  const target = Number.isFinite(entered) ? (isCard ? -Math.abs(entered) : entered) : null;
  const diff = target === null ? null : target - current;

  async function submit(e) {
    e.preventDefault();
    if (target === null) return store.toast('Enter the balance you actually have');
    if (diff === 0) { store.toast('Already matches — nothing to adjust'); onClose(); return; }
    setBusy(true);
    try {
      await store.saveTx({
        id: crypto.randomUUID(),
        // A shortfall is money that left without being logged, and vice versa.
        type: diff > 0 ? 'income' : 'expense',
        amount: Math.abs(diff),
        category: 'Other',
        note: `Balance adjustment · ${account.name}`,
        account: account.name,
        to_account: '',
        occurred_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
        rev: 1,
        deleted: 0,
        source: 'manual',
      });
      store.toast(`${account.name} reconciled · ${diff > 0 ? '+' : '−'}${rupees(Math.abs(diff))}`);
      onClose();
    } catch (err) { store.toast(err.message || 'Could not save'); setBusy(false); }
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3><Scale size={16} style={{ verticalAlign: '-2px' }} /> Reconcile {account.name}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat">
              <span className="stat-k">RupeeFlow says</span>
              <b className="stat-v">{isCard ? rupees(Math.abs(current)) : rupees(current)}</b>
            </div>
            {diff !== null && diff !== 0 && (
              <div className="stat">
                <span className="stat-k">Difference</span>
                <b className="stat-v" style={{ color: diff > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {diff > 0 ? '+' : '−'}{rupees(Math.abs(diff))}
                </b>
              </div>
            )}
          </div>
          <label className="stacked-label">
            <span>{isCard ? 'What you actually owe right now' : 'What your bank actually shows right now'}</span>
            <div className="amount-input">
              <span>₹</span>
              <input inputMode="decimal" autoFocus placeholder="0" value={actual}
                onChange={(e) => setActual(e.target.value)} />
            </div>
          </label>
          <p className="muted small">
            Records the gap as a dated entry rather than changing your starting balance, so past days keep
            the totals they actually had.
          </p>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary grow" disabled={busy}>
              {diff === null || diff === 0 ? 'Reconcile' : `Add ${diff > 0 ? '+' : '−'}${rupees(Math.abs(diff))} adjustment`}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
