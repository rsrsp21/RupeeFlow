'use client';
// Add a savings/investment holding — same reasoning as AccountModal: this
// belongs behind a button, not as a permanent row of empty inputs.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { HOLDING_TYPES, toPaise } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function HoldingModal({ onClose }) {
  const store = useStore();
  const [kind, setKind] = useState(HOLDING_TYPES[0]);
  const [customKind, setCustomKind] = useState('');
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);
  const isCustom = kind === '__custom__';

  async function submit(e) {
    e.preventDefault();
    const finalKind = isCustom ? customKind.trim() : kind;
    const finalName = name.trim() || finalKind;
    if (!finalName) return store.toast('Give it a name');
    if (store.holdings.some((h) => h.name.toLowerCase() === finalName.toLowerCase())) {
      return store.toast('That already exists');
    }
    setBusy(true);
    const ob = toPaise(opening);
    try {
      await store.saveHoldings([...store.holdings,
        { name: finalName, kind: finalKind || 'Other', opening_balance: Number.isFinite(ob) ? ob : 0 }]);
      store.toast(`Added ${finalName}`);
      onClose();
    } catch { setBusy(false); }
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3><PiggyBank size={16} style={{ verticalAlign: '-2px' }} /> Add savings or investment</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-row labelled">
            <label>
              <span>Kind</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)} autoFocus>
                {HOLDING_TYPES.map((t) => <option key={t}>{t}</option>)}
                <option value="__custom__">+ Custom…</option>
              </select>
            </label>
            <label>
              <span>{isCustom ? 'Custom kind' : 'Name (optional)'}</span>
              {isCustom
                ? <input placeholder="e.g. PPF, Gold" value={customKind}
                    onChange={(e) => setCustomKind(e.target.value)} />
                : <input placeholder="e.g. Nifty 50 SIP" value={name}
                    onChange={(e) => setName(e.target.value)} />}
            </label>
          </div>
          {isCustom && (
            <label className="stacked-label">
              <span>Name (optional)</span>
              <input placeholder="e.g. PPF account" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="stacked-label">
            <span>Value it already holds (optional)</span>
            <div className="amount-input">
              <span>₹</span>
              <input inputMode="decimal" placeholder="0" value={opening}
                onChange={(e) => setOpening(e.target.value)} />
            </div>
          </label>
          <p className="muted small">
            Only what it&apos;s worth <b>today</b>, before anything you log here. Money you move in later gets
            added on top, so putting past contributions in this figure would count them twice.
          </p>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary grow" disabled={busy}>Add</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
