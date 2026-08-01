'use client';
// Add an account. Lives in a modal rather than a permanent form row on the
// Money screen — a set of empty inputs sitting under your account list is
// visual noise the other 99% of the time.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { ACCOUNT_TYPES, toPaise } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function AccountModal({ onClose }) {
  const store = useStore();
  const [type, setType] = useState('Cash');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const isCard = type === 'Credit Card';

  async function submit(e) {
    e.preventDefault();
    // Name is optional — falling back to the type keeps every account
    // identifiable without forcing you to type "Cash" for cash.
    const finalName = name.trim() || type;
    if (store.accounts.some((a) => a.name.toLowerCase() === finalName.toLowerCase())) {
      return store.toast('That account already exists');
    }
    setBusy(true);
    const entered = toPaise(balance);
    // A card's figure is what you OWE, stored negative — a credit limit is
    // not money you have, and counting it would inflate your net worth.
    const opening_balance = Number.isFinite(entered)
      ? (isCard ? -Math.abs(entered) : entered)
      : 0;
    try {
      await store.saveAccounts([...store.accounts, { name: finalName, type, opening_balance }]);
      store.toast(`Added ${finalName}`);
      onClose();
    } catch { setBusy(false); }
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3><Wallet size={16} style={{ verticalAlign: '-2px' }} /> Add account</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-row labelled">
            <label>
              <span>Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} autoFocus>
                {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span>Name (optional)</span>
              <input placeholder="e.g. HDFC, Wife&apos;s card" value={name}
                onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <label className="stacked-label">
            <span>{isCard ? 'Outstanding due right now' : 'Starting balance'} (optional)</span>
            <div className="amount-input">
              <span>₹</span>
              <input inputMode="decimal" placeholder="0" value={balance}
                onChange={(e) => setBalance(e.target.value)} />
            </div>
          </label>
          {isCard && (
            <div className="callout">
              <AlertTriangle size={14} />
              <span>
                Enter what you currently <b>owe</b> on this card — not its credit limit.
                If you haven&apos;t used it and the full limit is still available, enter <b>0</b>.
                A limit isn&apos;t your money, and counting it would inflate your balance by the whole limit.
              </span>
            </div>
          )}
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary grow" disabled={busy}>Add account</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
