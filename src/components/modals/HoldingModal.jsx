'use client';
// Add a savings/investment holding — same reasoning as AccountModal: this
// belongs behind a button, not as a permanent row of empty inputs.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import AmountInput from '../AmountInput';
import { HOLDING_TYPES, toPaise } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function HoldingModal({ onClose, existing = null }) {
  const store = useStore();
  const editing = Boolean(existing);
  // A custom kind saved earlier isn't in HOLDING_TYPES, so reopen the custom
  // field with it rather than silently snapping to the first standard kind.
  const known = existing && HOLDING_TYPES.includes(existing.kind);
  const [kind, setKind] = useState(existing ? (known ? existing.kind : '__custom__') : HOLDING_TYPES[0]);
  const [customKind, setCustomKind] = useState(existing && !known ? existing.kind : '');
  const [name, setName] = useState(existing?.name || '');
  // The field shows what the holding is worth RIGHT NOW — the last stated
  // value plus anything moved in since — not the raw stored figure. Showing
  // the stored one meant a holding reading ₹2,20,000 on screen opened its
  // editor at ₹2,00,000, and anyone "correcting" that to the number they
  // could see would restate the value and silently stop the ₹20,000 from
  // counting on top of it.
  const stated = existing ? (store.holdingBalances()[existing.name] || 0) : 0;
  const [opening, setOpening] = useState(stated ? String(stated / 100) : '');
  const valuedOn = existing?.valued_at
    ? new Date(existing.valued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const [busy, setBusy] = useState(false);
  const isCustom = kind === '__custom__';

  async function submit(e) {
    e.preventDefault();
    const finalKind = isCustom ? customKind.trim() : kind;
    const finalName = name.trim() || finalKind;
    if (!finalName) return store.toast('Give it a name');
    const clash = store.holdings.some((h) =>
      h.name.toLowerCase() === finalName.toLowerCase() && h.name !== existing?.name);
    if (clash) return store.toast('That already exists');
    // See AccountModal: one name, one meaning. A holding sharing an account's
    // name is shadowed by it and would silently stop counting.
    if (store.accounts.some((a) => a.name.toLowerCase() === finalName.toLowerCase()))
      return store.toast(`"${finalName}" is already an account — pick another name`);
    setBusy(true);
    const ob = toPaise(opening);
    const value = Number.isFinite(ob) ? ob : 0;
    // Two separate numbers, and they must stay separate. opening_balance is
    // COST BASIS — what the holding was worth when you started tracking it,
    // and the thing every later contribution adds to. current_value is what
    // it's worth now. Zeroing the basis when a value is updated made the
    // whole balance look like pure profit, so an edit never touches it.
    // Unchanged means "the live figure is still right", so nothing is
    // restated and contributions since the last valuation keep counting.
    const changed = value !== stated;
    const patch = existing
      ? {
          opening_balance: existing.opening_balance,
          current_value: changed ? value : existing.current_value,
          // Re-stamp only on a real change, so renaming can't reset the
          // as-of date and swallow contributions made since.
          valued_at: changed ? Date.now() : existing.valued_at,
        }
      : { opening_balance: value, current_value: value, valued_at: value ? Date.now() : 0 };
    try {
      if (editing) {
        // Repoint the ledger first, then one list write matched on the old
        // name — see AccountModal for why this can't be two saves.
        if (finalName !== existing.name) await store.renameHoldingRefs(existing.name, finalName);
        await store.saveHoldings(store.holdings.map((h) =>
          h.name === existing.name
            ? { ...h, name: finalName, kind: finalKind || 'Other', ...patch } : h));
        store.toast('Updated');
      } else {
        await store.saveHoldings([...store.holdings,
          { name: finalName, kind: finalKind || 'Other', ...patch }]);
        store.toast(`Added ${finalName}`);
      }
      onClose();
    } catch (err) { store.toast(err.message || 'Could not save'); setBusy(false); }
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3><PiggyBank size={16} style={{ verticalAlign: '-2px' }} /> {editing ? 'Edit holding' : 'Add savings or investment'}</h3>
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
              <span>{isCustom ? 'Custom kind' : `Name${editing ? '' : ' (optional)'}`}</span>
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
            <span>What it&apos;s worth today{editing ? '' : ' (optional)'}</span>
            <div className="amount-input">
              <span>₹</span>
              <AmountInput placeholder="0" value={opening} onChange={setOpening} />
            </div>
          </label>
          <p className="muted small">
            Market value today, not what you paid in.{valuedOn ? ` Last set ${valuedOn}.` : ''}
          </p>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary grow" disabled={busy}>{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
