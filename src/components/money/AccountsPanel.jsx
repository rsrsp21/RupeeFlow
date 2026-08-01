'use client';
// Accounts panel — lives on the Money screen. Accounts are spendable places
// money sits; savings/investments are holdings and live on their own tab.
import { useState } from 'react';
import { Plus, Wallet, Trash2, Pencil, Scale, ChevronUp, ChevronDown } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, ACCOUNT_TYPES, toPaise } from '@/lib/client/constants';
import AccountIcon from '../AccountIcon';
import ConfirmModal from '../modals/ConfirmModal';
import AccountModal from '../modals/AccountModal';
import ReconcileModal from '../modals/ReconcileModal';

export default function AccountsPanel() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // the account object, or null
  const [editing, setEditing] = useState(null); // the account being edited, or null
  const [blocked, setBlocked] = useState(null); // name whose delete was refused
  const [reconciling, setReconciling] = useState(null); // account being checked against reality
  const balances = store.accountBalances();
  const usage = {};
  for (const t of store.live()) {
    usage[t.account] = (usage[t.account] || 0) + 1;
    if (t.to_account) usage[t.to_account] = (usage[t.to_account] || 0) + 1;
  }

  const [reorderMode, setReorderMode] = useState(false);

  // A `disabled` button can't be clicked, so it explains nothing — it just
  // looks broken. The button stays live and answers on tap, in a bubble
  // beside the row rather than a toast at the other end of the screen.
  function requestRemove(a) {
    const why = usage[a.name]
      ? `Used by ${usage[a.name]} ${usage[a.name] === 1 ? 'entry' : 'entries'}`
      : store.accounts.length <= 1 ? 'Keep at least one account' : null;
    if (why) {
      setBlocked({ name: a.name, why });
      clearTimeout(requestRemove.t);
      requestRemove.t = setTimeout(() => setBlocked(null), 2400);
      return;
    }
    setConfirmRemove(a);
  }

  async function doRemove(a) {
    try {
      await store.saveAccounts(store.accounts.filter((x) => x.name !== a.name));
      store.toast(`Removed ${a.name}`);
    } catch {}
  }

  async function moveUp(index) {
    if (index === 0) return;
    const arr = [...store.accounts];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    await store.saveAccounts(arr);
  }

  async function moveDown(index) {
    if (index === store.accounts.length - 1) return;
    const arr = [...store.accounts];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    await store.saveAccounts(arr);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Wallet size={13} style={{ verticalAlign: '-2px' }} /> Accounts</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>Edit to rename or set a credit limit. Reconcile to match your bank without rewriting past totals.</p>

      <div className="acct-list">
        {store.accounts.map((a, i) => {
          const bal = balances[a.name] || 0;
          const card = a.type === 'Credit Card';
          const used = card ? Math.max(0, -bal) : 0;
          return (
            <div className="holding-row" key={a.name}>
              <AccountIcon type={a.type} tile size={15} />
              <div className="holding-main">
                <span className="holding-name">{a.name}</span>
                <span className="holding-meta">
                  <span className="tx-tag">{a.type}</span>
                  {i === 0 && <span className="tx-tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', borderColor: 'var(--accent)' }}>Primary</span>}
                  {usage[a.name] || 0} entries
                  {card && a.limit_amount > 0 &&
                    ` · ${rupees(used)} of ${rupees(a.limit_amount)} used`}
                </span>
              </div>
              <b className="holding-bal" style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                {card
                  ? `${rupees(Math.abs(bal))}${bal < 0 ? ' due' : ''}`
                  : `${bal < 0 ? '−' : ''}${rupees(Math.abs(bal))}`}
              </b>
              {reorderMode && (
                <div className="reorder-btns" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 4 }}>
                  <button className="icon-btn" onClick={() => moveUp(i)} disabled={i === 0} title="Move up" style={{ padding: 2, opacity: i === 0 ? 0.2 : 1 }}>
                    <ChevronUp size={14} />
                  </button>
                  <button className="icon-btn" onClick={() => moveDown(i)} disabled={i === store.accounts.length - 1} title="Move down" style={{ padding: 2, opacity: i === store.accounts.length - 1 ? 0.2 : 1 }}>
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}
              <button className="icon-btn" onClick={() => setEditing(a)} title="Edit account">
                <Pencil size={13} />
              </button>
              <span className="del-wrap">
                <button className={`icon-btn ${usage[a.name] ? 'muted-btn' : ''}`}
                  onClick={() => requestRemove(a)} title="Remove account">
                  <Trash2 size={14} />
                </button>
                {blocked?.name === a.name && <span className="hint-bubble">{blocked.why}</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add account
        </button>
        {store.accounts.length > 1 && (
          <button className="btn ghost" onClick={() => setReorderMode(!reorderMode)}>
            {reorderMode ? 'Done reordering' : 'Reorder'}
          </button>
        )}
      </div>

      {adding && <AccountModal onClose={() => setAdding(false)} />}
      {editing && <AccountModal existing={editing} onClose={() => setEditing(null)} onReconcile={(a) => { setEditing(null); setReconciling(a); }} />}
      {reconciling && <ReconcileModal account={reconciling} onClose={() => setReconciling(null)} />}

      {confirmRemove && (
        <ConfirmModal
          title="Remove this account?"
          message={`"${confirmRemove.name}" will be removed from your account list. This can't be undone.`}
          onConfirm={() => { doRemove(confirmRemove); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
