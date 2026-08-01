'use client';
// Accounts panel — lives on the Money screen. Accounts are spendable places
// money sits; savings/investments are holdings and live on their own tab.
import { useState } from 'react';
import { Plus, Wallet, Trash2, Pencil } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, ACCOUNT_TYPES, toPaise } from '@/lib/client/constants';
import AccountIcon from '../AccountIcon';
import ConfirmModal from '../modals/ConfirmModal';
import AccountModal from '../modals/AccountModal';

export default function AccountsPanel() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // the account object, or null
  const [editing, setEditing] = useState(null); // the account being edited, or null
  const balances = store.accountBalances();
  const usage = {};
  for (const t of store.live()) {
    usage[t.account] = (usage[t.account] || 0) + 1;
    if (t.to_account) usage[t.to_account] = (usage[t.to_account] || 0) + 1;
  }

  function requestRemove(a) {
    if (usage[a.name]) return store.toast(`${a.name} is used by ${usage[a.name]} entries and can't be removed`);
    if (store.accounts.length <= 1) return store.toast('Keep at least one account');
    setConfirmRemove(a);
  }

  async function doRemove(a) {
    try {
      await store.saveAccounts(store.accounts.filter((x) => x.name !== a.name));
      store.toast(`Removed ${a.name}`);
    } catch {}
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Wallet size={13} style={{ verticalAlign: '-2px' }} /> Accounts</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Balances start from an optional starting balance, then follow your ledger: income adds, expenses
        subtract, transfers move between accounts. Tap any account to rename it, change its type, or set a
        credit limit.
      </p>

      <div className="acct-list">
        {store.accounts.map((a) => {
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
              <button className="icon-btn" onClick={() => setEditing(a)} title="Edit account">
                <Pencil size={13} />
              </button>
              <button className="icon-btn" onClick={() => requestRemove(a)} title="Remove account" disabled={!!usage[a.name]}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <button className="btn ghost" onClick={() => setAdding(true)}>
        <Plus size={14} /> Add account
      </button>

      {adding && <AccountModal onClose={() => setAdding(false)} />}
      {editing && <AccountModal existing={editing} onClose={() => setEditing(null)} />}

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
