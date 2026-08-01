'use client';
// Shown once, automatically, the first time someone has zero accounts (a
// genuinely new signup — see the derive-from-history effect in store.jsx for
// why an *existing* user practically never hits this). Picking a type is
// enough on its own; name is only for telling similar accounts apart later.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { useStore } from '@/lib/client/store';
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
    const opening_balance = toPaise(balance);
    try {
      await store.saveAccounts([...store.accounts, { name: finalName, type, opening_balance: Number.isFinite(opening_balance) ? opening_balance : 0 }]);
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
            <input inputMode="decimal" placeholder="Starting balance (optional)"
              value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={onSkip}>Maybe later</button>
            <button type="submit" className="btn primary grow" disabled={busy}>Record first expense/income</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
