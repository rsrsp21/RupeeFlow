'use client';
import { useEffect, useState } from 'react';
import { Download, LogOut, RefreshCw, Plus, Wallet, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { useUI } from '../App';

export default function Settings() {
  const store = useStore();
  const { openExport } = useUI();
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(document.documentElement.dataset.theme === 'dark'); }, []);

  function toggleTheme(v) {
    setDark(v);
    document.documentElement.dataset.theme = v ? 'dark' : 'light';
    localStorage.setItem('rf_theme', v ? 'dark' : 'light');
  }

  const counts = store.live().length;

  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Settings</h2><p className="sub">{store.email}</p></div>
      </header>

      <div className="card">
        <h3>Appearance</h3>
        <label className="row-setting">
          <span>Dark mode</span>
          <input type="checkbox" className="switch" checked={dark} onChange={(e) => toggleTheme(e.target.checked)} />
        </label>
      </div>

      <AccountsCard />

      <div className="card">
        <div className="card-head">
          <h3>Export &amp; backup</h3>
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          {counts} entries available. Choose format, timeline, filters and columns in the export builder.
        </p>
        <button className="btn ghost" onClick={openExport}><Download size={14} /> Open export builder</button>
      </div>

      <div className="card">
        <h3>Sync</h3>
        <p className="muted small" style={{ marginBottom: 12 }}>
          {store.lastSync
            ? `Last synced ${new Date(store.lastSync).toLocaleTimeString('en-IN')} · auto-syncs every few seconds`
            : 'Waiting for first sync…'}
        </p>
        <button className="btn ghost" onClick={() => { store.toast('Syncing…'); store.syncNow(); }}>
          <RefreshCw size={14} /> Sync now
        </button>
      </div>

      <div className="card">
        <h3>Account</h3>
        <button className="btn danger-ghost" onClick={store.logout}><LogOut size={14} /> Sign out</button>
      </div>
    </section>
  );
}

function AccountsCard() {
  const store = useStore();
  const [adding, setAdding] = useState('');
  const balances = store.accountBalances();
  const usage = {};
  for (const t of store.live()) {
    usage[t.account] = (usage[t.account] || 0) + 1;
    if (t.to_account) usage[t.to_account] = (usage[t.to_account] || 0) + 1;
  }

  async function add(e) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    if (store.accounts.some((a) => a.toLowerCase() === name.toLowerCase())) {
      return store.toast('That account already exists');
    }
    await store.saveAccounts([...store.accounts, name]);
    setAdding('');
    store.toast(`Added ${name}`);
  }

  async function remove(name) {
    if (usage[name]) return store.toast(`${name} is used by ${usage[name]} entries — can't remove`);
    if (store.accounts.length <= 1) return store.toast('Keep at least one account');
    await store.saveAccounts(store.accounts.filter((a) => a !== name));
    store.toast(`Removed ${name}`);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Wallet size={13} style={{ verticalAlign: '-2px' }} /> Accounts</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Balances are derived from your ledger — income adds, expenses subtract, transfers move between accounts.
      </p>

      <div className="acct-list">
        {store.accounts.map((a) => {
          const bal = balances[a] || 0;
          return (
            <div className="acct-row" key={a}>
              <span className="acct-name">{a}</span>
              <span className="acct-count">{usage[a] || 0} entries</span>
              <b className="acct-bal" style={{ color: bal < 0 ? 'var(--red)' : bal > 0 ? 'var(--green)' : 'var(--muted)' }}>
                {bal < 0 ? '−' : ''}{rupees(Math.abs(bal))}
              </b>
              <button className="icon-btn" onClick={() => remove(a)} title="Remove account" disabled={!!usage[a]}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <form className="acct-add" onSubmit={add}>
        <input placeholder="Add an account (e.g. HDFC, Paytm, Wife's card)"
          value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn ghost" type="submit"><Plus size={14} /> Add</button>
      </form>
    </div>
  );
}
