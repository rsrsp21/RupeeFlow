'use client';
// Accounts panel — lives on the Money screen. Accounts are spendable places
// money sits; savings/investments are holdings and live on their own tab.
import { useState } from 'react';
import { Plus, Wallet, Trash2, Pencil, Check, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, ACCOUNT_TYPES, toPaise } from '@/lib/client/constants';
import AccountIcon from '../AccountIcon';
import ConfirmModal from '../modals/ConfirmModal';

export default function AccountsPanel() {
  const store = useStore();
  const [addingName, setAddingName] = useState('');
  const [addingType, setAddingType] = useState('Cash');
  const [addingBalance, setAddingBalance] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // the account object, or null
  const [editingBal, setEditingBal] = useState(null); // account name currently being edited, or null
  const [editVal, setEditVal] = useState('');
  const balances = store.accountBalances();
  const usage = {};
  for (const t of store.live()) {
    usage[t.account] = (usage[t.account] || 0) + 1;
    if (t.to_account) usage[t.to_account] = (usage[t.to_account] || 0) + 1;
  }

  async function add(e) {
    e.preventDefault();
    // Name is optional — falling back to the type keeps every account
    // nameable/identifiable without forcing you to type "Cash" for cash.
    const name = addingName.trim() || addingType;
    if (store.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      return store.toast('That account already exists');
    }
    const entered = toPaise(addingBalance);
    // Cards store what you owe, as a negative — see AddAccountModal.
    const opening_balance = Number.isFinite(entered)
      ? (addingType === 'Credit Card' ? -Math.abs(entered) : entered)
      : 0;
    try {
      await store.saveAccounts([...store.accounts, { name, type: addingType, opening_balance }]);
      setAddingName(''); setAddingBalance('');
      store.toast(`Added ${name}`);
    } catch {}
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

  function startEditBalance(a) {
    setEditingBal(a.name);
    // Cards are held negative but edited as a plain "amount owed".
    const v = a.opening_balance ? Math.abs(a.opening_balance) / 100 : '';
    setEditVal(v === '' ? '' : String(v));
  }

  async function saveBalance(a) {
    const entered = toPaise(editVal);
    const paise = Number.isFinite(entered)
      ? (a.type === 'Credit Card' ? -Math.abs(entered) : entered)
      : 0;
    try {
      await store.saveAccounts(store.accounts.map((x) =>
        x.name === a.name ? { ...x, opening_balance: paise } : x));
      setEditingBal(null);
      store.toast('Starting balance updated');
    } catch {}
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Wallet size={13} style={{ verticalAlign: '-2px' }} /> Accounts</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Balances start from an optional starting balance, then follow your ledger: income adds, expenses subtract, transfers move between accounts.
        For a credit card, enter what you <b>owe</b> rather than its limit — a limit isn&apos;t money you have.
        Savings and investments aren&apos;t accounts; they live on the Savings screen.
      </p>

      <div className="acct-list">
        {store.accounts.map((a) => {
          const bal = balances[a.name] || 0;
          const editing = editingBal === a.name;
          return (
            <div className="acct-row" key={a.name}>
              <AccountIcon type={a.type} tile size={15} />
              <span className="acct-name">{a.name}</span>
              <span className="acct-count">{usage[a.name] || 0} entries</span>
              {editing ? (
                <form className="acct-bal-edit" onSubmit={(e) => { e.preventDefault(); saveBalance(a); }}>
                  <span>₹</span>
                  <input autoFocus inputMode="decimal" placeholder="0" value={editVal} onChange={(e) => setEditVal(e.target.value)} />
                  <button className="icon-btn" type="submit" title="Save"><Check size={13} /></button>
                  <button className="icon-btn" type="button" onClick={() => setEditingBal(null)} title="Cancel"><X size={13} /></button>
                </form>
              ) : (
                <>
                  <b className="acct-bal" style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                    {a.type === 'Credit Card'
                      ? `${rupees(Math.abs(bal))}${bal < 0 ? ' due' : ''}`
                      : `${bal < 0 ? '−' : ''}${rupees(Math.abs(bal))}`}
                  </b>
                  <button className="icon-btn" onClick={() => startEditBalance(a)}
                    title={a.type === 'Credit Card' ? 'Set amount owed' : 'Set starting balance'}>
                    <Pencil size={13} />
                  </button>
                </>
              )}
              <button className="icon-btn" onClick={() => requestRemove(a)} title="Remove account" disabled={!!usage[a.name]}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <form className="acct-add" onSubmit={add}>
        <select value={addingType} onChange={(e) => setAddingType(e.target.value)} title="Account type (sets the icon)">
          {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input placeholder="Name (optional, e.g. HDFC, Wife's card)"
          value={addingName} onChange={(e) => setAddingName(e.target.value)} />
        <input inputMode="decimal"
          placeholder={addingType === 'Credit Card' ? 'Outstanding due (optional)' : 'Starting balance (optional)'}
          value={addingBalance} onChange={(e) => setAddingBalance(e.target.value)} />
        <button className="btn ghost" type="submit"><Plus size={14} /> Add</button>
      </form>

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
