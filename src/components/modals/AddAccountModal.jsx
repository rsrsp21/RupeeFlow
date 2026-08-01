'use client';
// Shown once, automatically, the first time someone has zero accounts (a
// genuinely new signup — see the derive-from-history effect in store.jsx for
// why an *existing* user practically never hits this). Picking a type is
// enough on its own; name is only for telling similar accounts apart later.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import AmountInput from '../AmountInput';
import { ACCOUNT_TYPES, toPaise } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function AddAccountModal({ onDone, onSkip }) {
  const store = useStore();
  const [type, setType] = useState('Cash');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const finalName = name.trim() || type;
    const entered = toPaise(balance);
    // For a card the figure is what you OWE, so it's stored negative — a
    // credit limit is not money you have, and treating it as a balance would
    // silently inflate your net worth by the whole limit.
    const opening_balance = Number.isFinite(entered)
      ? (type === 'Credit Card' ? -Math.abs(entered) : entered)
      : 0;
    try {
      await store.saveAccounts([...store.accounts, { name: finalName, type, opening_balance }]);
      store.toast(`Added ${finalName}`);
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3><Wallet size={16} style={{ verticalAlign: '-2px' }} /> Add your first account</h3>
        </div>
        <p className="muted small" style={{ marginBottom: 16 }}>
          Every entry needs an account to belong to. Pick a type below (it sets the icon) — a name is only needed if you'll have more than one of that type, like "HDFC" or "Wife's card".
        </p>
        <form onSubmit={submit}>
          <select value={type} onChange={(e) => setType(e.target.value)} autoFocus>
            {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="amount-input">
            <span>₹</span>
            <AmountInput
              placeholder={type === 'Credit Card' ? 'Outstanding due right now (optional)' : 'Starting balance (optional)'}
              value={balance} onChange={setBalance} />
          </div>
          {type === 'Credit Card' && (
            <div className="callout">
              <AlertTriangle size={14} />
              <span>Enter what you <b>owe</b>, not your limit. Nothing used? Enter <b>0</b>.</span>
            </div>
          )}
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={onSkip}>Maybe later</button>
            <button type="submit" className="btn primary grow" disabled={busy}>Record first expense/income</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
