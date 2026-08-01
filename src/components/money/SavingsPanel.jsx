'use client';
// Savings & investments — money that's still yours but isn't spendable day to
// day. Deliberately separate from accounts: an FD or a mutual fund sitting in
// the accounts list made the ledger's "Net" read like money you could spend.
// Funding a holding is recorded as a transfer out of a real account, so it
// never counts as spending, but it does leave your spendable balance.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, Plus, Trash2, Pencil } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { DAY_MS, startOfDay } from '@/lib/client/period';
import { useUI } from '../App';
import HoldingIcon from '../HoldingIcon';
import ConfirmModal from '../modals/ConfirmModal';
import HoldingModal from '../modals/HoldingModal';
import TxItem from '../TxItem';

function dayHeading(dayStart) {
  const today = startOfDay();
  if (dayStart === today) return 'Today';
  if (dayStart === today - DAY_MS) return 'Yesterday';
  return new Date(dayStart).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function SavingsPanel() {
  const store = useStore();
  const { openTx } = useUI();
  const balances = store.holdingBalances();
  const contributed = store.holdingContributed();

  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [editing, setEditing] = useState(null); // the holding being edited

  // Every entry that funded or drew down a holding, grouped by day exactly
  // like the Ledger — a balance on its own doesn't tell you what built it.
  const movements = useMemo(() => {
    const names = new Set(store.holdings.map((h) => h.name));
    const rows = store.live()
      .filter((t) => t.type === 'transfer' && (names.has(t.to_account) || names.has(t.account)))
      .sort((a, b) => b.occurred_at - a.occurred_at)
      .slice(0, 200);
    const map = new Map();
    for (const t of rows) {
      const k = startOfDay(Number(t.occurred_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [store.holdings, store.txs]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doRemove(h) {
    try {
      await store.saveHoldings(store.holdings.filter((x) => x.name !== h.name));
      store.toast(`Removed ${h.name}`);
    } catch {}
  }

  return (
    <>
      {store.holdings.length > 0 && (
        <div className="panel-bar">
          <span className="panel-bar-note">
            {store.holdings.length} {store.holdings.length === 1 ? 'holding' : 'holdings'} · moving money in
            lowers your spendable balance without counting as spending
          </span>
          <div className="head-actions">
            <button className="btn ghost sm" onClick={() => openTx({ prefill: { type: 'invest' } })}>
              <Plus size={14} /> Move money in
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {store.holdings.length > 0 && <div className="card-head"><h3>Your holdings</h3></div>}
        {store.holdings.length ? (
          <div className="acct-list">
            {store.holdings.map((h, i) => {
              const bal = balances[h.name] || 0;
              const put = contributed[h.name] || 0;
              // Gain only means something once a real value has been stated —
              // before that the balance IS the contributions, so it'd read 0.
              const gain = h.valued_at ? bal - put : 0;
              const pct = h.valued_at && put > 0 ? (gain / put) * 100 : null;
              return (
                <motion.div className="holding-row" key={h.name}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <HoldingIcon kind={h.kind} tile size={15} />
                  <div className="holding-main">
                    <span className="holding-name">{h.name}</span>
                    <span className="holding-meta">
                      <span className="tx-tag">{h.kind}</span>
                      {rupees(put)} in
                      {gain !== 0 && (
                        <span style={{ color: gain > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                          {gain > 0 ? '▲' : '▼'} {rupees(Math.abs(gain))}
                          {pct !== null ? ` (${gain > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)` : ''}
                        </span>
                      )}
                      <span>{h.valued_at
                        ? `valued ${new Date(h.valued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : 'value not set'}</span>
                    </span>
                  </div>
                  <b className="holding-bal" style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                    {bal < 0 ? '−' : ''}{rupees(Math.abs(bal))}
                  </b>
                  <button className="icon-btn" title="Edit holding" onClick={() => setEditing(h)}>
                    <Pencil size={13} />
                  </button>
                  <button className="icon-btn" onClick={() => setConfirmRemove(h)} title="Remove">
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <PiggyBank size={26} strokeWidth={1.5} />
            <h4>Track what you&apos;ve set aside</h4>
            <p>
              A mutual fund, FD, stock holding, or even cash kept at home. Money moved into one leaves your
              spendable balance without counting as spending — and its value stays part of your net worth.
            </p>
            <button className="btn primary" style={{ width: 'auto' }} onClick={() => setAdding(true)}>
              <Plus size={14} /> Add your first holding
            </button>
          </div>
        )}

        {store.holdings.length > 0 && (
          <button className="btn ghost" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add savings or investment
          </button>
        )}
      </div>

      {movements.length > 0 && (
        <div className="card list-card">
          <div className="card-head"><h3>Money moved in &amp; out</h3></div>
          <ul className="tx-list">
            {movements.map(([day, items]) => (
              <li key={day}>
                <div className="date-head">
                  <span>{dayHeading(day)}</span>
                </div>
                <ul className="tx-list">{items.map((t, i) => <TxItem key={t.id} t={t} index={i} />)}</ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding && <HoldingModal onClose={() => setAdding(false)} />}
      {editing && <HoldingModal existing={editing} onClose={() => setEditing(null)} />}

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
