'use client';
// Savings & investments — money that's still yours but isn't spendable day to
// day. Deliberately separate from accounts: an FD or a mutual fund sitting in
// the accounts list made the ledger's "Net" read like money you could spend.
// Funding a holding is recorded as a transfer out of a real account, so it
// never counts as spending, but it does leave your spendable balance.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, toPaise, HOLDING_TYPES } from '@/lib/client/constants';
import { useUI } from '../App';
import HoldingIcon from '../HoldingIcon';
import ConfirmModal from '../modals/ConfirmModal';

export default function SavingsPanel() {
  const store = useStore();
  const { openTx } = useUI();
  const balances = store.holdingBalances();

  const [name, setName] = useState('');
  const [kind, setKind] = useState(HOLDING_TYPES[0]);
  const [opening, setOpening] = useState('');
  const [customKind, setCustomKind] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');

  // How much has moved in/out of each holding through the ledger, so a row
  // can show contributions separately from its starting value.
  const flows = useMemo(() => {
    const map = {};
    for (const h of store.holdings) map[h.name] = { in: 0, out: 0, n: 0 };
    for (const t of store.live()) {
      if (t.type !== 'transfer') continue;
      const amt = Number(t.amount) || 0;
      if (map[t.to_account]) { map[t.to_account].in += amt; map[t.to_account].n++; }
      if (map[t.account]) { map[t.account].out += amt; map[t.account].n++; }
    }
    return map;
  }, [store.holdings, store.txs]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault();
    const finalKind = kind === '__custom__' ? customKind.trim() : kind;
    const finalName = name.trim() || finalKind;
    if (!finalName) return store.toast('Give it a name');
    if (store.holdings.some((h) => h.name.toLowerCase() === finalName.toLowerCase())) {
      return store.toast('That already exists');
    }
    const ob = toPaise(opening);
    try {
      await store.saveHoldings([...store.holdings,
        { name: finalName, kind: finalKind || 'Other', opening_balance: Number.isFinite(ob) ? ob : 0 }]);
      setName(''); setOpening(''); setCustomKind('');
      store.toast(`Added ${finalName}`);
    } catch {}
  }

  async function doRemove(h) {
    try {
      await store.saveHoldings(store.holdings.filter((x) => x.name !== h.name));
      store.toast(`Removed ${h.name}`);
    } catch {}
  }

  async function saveOpening(h) {
    const paise = toPaise(editVal);
    try {
      await store.saveHoldings(store.holdings.map((x) =>
        x.name === h.name ? { ...x, opening_balance: Number.isFinite(paise) ? paise : 0 } : x));
      setEditing(null);
      store.toast('Starting value updated');
    } catch {}
  }

  return (
    <>
      <div className="panel-bar">
        <span className="panel-bar-note">
          {store.holdings.length} {store.holdings.length === 1 ? 'holding' : 'holdings'}
        </span>
        <div className="head-actions">
          <button className="btn ghost sm" onClick={() => openTx({ prefill: { type: 'invest' } })}
            disabled={!store.holdings.length}>
            <Plus size={14} /> Move money in
          </button>
        </div>
      </div>

      {/* The net-worth hero lives on the Money screen above these tabs — it
          covers every tab, so repeating it here would just be noise. */}
      <p className="muted small" style={{ marginBottom: 12 }}>
        Money here isn&apos;t counted as spending, and it isn&apos;t counted as spendable either — moving it in
        lowers your account balance without inflating your expenses.
      </p>

      <div className="card">
        <div className="card-head"><h3>Your holdings</h3></div>
        {store.holdings.length ? (
          <div className="acct-list">
            {store.holdings.map((h, i) => {
              const bal = balances[h.name] || 0;
              const f = flows[h.name] || { in: 0, out: 0, n: 0 };
              return (
                <motion.div className="holding-row" key={h.name}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <HoldingIcon kind={h.kind} tile size={15} />
                  <div className="holding-main">
                    <span className="holding-name">{h.name}</span>
                    <span className="holding-meta">
                      <span className="tx-tag">{h.kind}</span>
                      {f.in ? `+${rupees(f.in)} in` : 'no contributions yet'}{f.out ? ` · ${rupees(f.out)} out` : ''}
                    </span>
                  </div>
                  {editing === h.name ? (
                    <form className="acct-bal-edit" onSubmit={(e) => { e.preventDefault(); saveOpening(h); }}>
                      <span>₹</span>
                      <input autoFocus inputMode="decimal" placeholder="0"
                        value={editVal} onChange={(e) => setEditVal(e.target.value)} />
                      <button className="icon-btn" type="submit" title="Save"><Check size={13} /></button>
                      <button className="icon-btn" type="button" onClick={() => setEditing(null)} title="Cancel"><X size={13} /></button>
                    </form>
                  ) : (
                    <>
                      <b className="holding-bal" style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                        {bal < 0 ? '−' : ''}{rupees(Math.abs(bal))}
                      </b>
                      <button className="icon-btn" title="Set starting value"
                        onClick={() => { setEditing(h.name); setEditVal(h.opening_balance ? String(h.opening_balance / 100) : ''); }}>
                        <Pencil size={13} />
                      </button>
                    </>
                  )}
                  <button className="icon-btn" onClick={() => setConfirmRemove(h)} title="Remove">
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="budget-empty">
            <PiggyBank size={22} strokeWidth={1.6} />
            <div>
              <div className="insight-title">Nothing set up yet</div>
              <div className="insight-body">
                Add a mutual fund, FD, stock holding, or even cash kept at home — then move money into it from any account.
              </div>
            </div>
          </div>
        )}

        <form className="acct-add" onSubmit={add}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} title="What kind of holding">
            {HOLDING_TYPES.map((t) => <option key={t}>{t}</option>)}
            <option value="__custom__">+ Custom…</option>
          </select>
          {kind === '__custom__' && (
            <input placeholder="Kind (e.g. PPF, Gold)" value={customKind}
              onChange={(e) => setCustomKind(e.target.value)} />
          )}
          <input placeholder="Name (optional, e.g. Nifty 50 SIP)" value={name}
            onChange={(e) => setName(e.target.value)} />
          <input placeholder="Starting value (optional)" inputMode="decimal"
            value={opening} onChange={(e) => setOpening(e.target.value)} />
          <button className="btn ghost" type="submit"><Plus size={14} /> Add</button>
        </form>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove this holding?"
          message={`"${confirmRemove.name}" will be removed. Any entries that moved money into it stay in your ledger, but they'll no longer count as invested.`}
          onConfirm={() => { const h = confirmRemove; setConfirmRemove(null); doRemove(h); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </>
  );
}
