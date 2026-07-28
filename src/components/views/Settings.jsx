
'use client';
import { useEffect, useState } from 'react';
import { Download, LogOut, RefreshCw, Plus, Wallet, Trash2, Pencil, Check, X, Bell } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { pushSupported, currentSubscription, enablePush, disablePush } from '@/lib/client/pushClient';
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
        <div><h2>Settings</h2><p className="sub">{store.name ? `${store.name} · ${store.email}` : store.email}</p></div>
      </header>

      <div className="card">
        <h3>Appearance</h3>
        <label className="row-setting">
          <span>Dark mode</span>
          <input type="checkbox" className="switch" checked={dark} onChange={(e) => toggleTheme(e.target.checked)} />
        </label>
      </div>

      <NotificationsCard />

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
        <NameRow />
        <button className="btn danger-ghost" onClick={store.logout}><LogOut size={14} /> Sign out</button>
      </div>
    </section>
  );
}

function NameRow() {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(store.name || '');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setVal(store.name || '');
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await store.saveName(val.trim());
      setEditing(false);
      store.toast(val.trim() ? 'Name updated' : 'Name cleared');
    } catch (err) { store.toast(err.message); }
    setBusy(false);
  }

  if (editing) {
    return (
      <form className="name-edit" onSubmit={save}>
        <input autoFocus placeholder="Your name" maxLength={80}
          value={val} onChange={(e) => setVal(e.target.value)} />
        <button className="icon-btn" type="submit" disabled={busy} title="Save"><Check size={15} /></button>
        <button className="icon-btn" type="button" onClick={() => setEditing(false)} title="Cancel"><X size={15} /></button>
      </form>
    );
  }

  return (
    <div className="row-setting">
      <span>{store.name || <span className="muted">No name set</span>}</span>
      <button className="icon-btn" onClick={startEdit} title={store.name ? 'Edit name' : 'Add name'}>
        <Pencil size={14} />
      </button>
    </div>
  );
}

function NotificationsCard() {
  const store = useStore();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  // Reflect the browser's actual state — the user may have revoked
  // permission or cleared site data since they last turned this on.
  useEffect(() => {
    if (!supported) return;
    currentSubscription().then((s) => setOn(!!s && Notification.permission === 'granted')).catch(() => {});
  }, [supported]);

  async function toggle(want) {
    setBusy(true);
    try {
      if (want) { await enablePush(store.api); setOn(true); store.toast('Notifications on'); }
      else { await disablePush(store.api); setOn(false); store.toast('Notifications off'); }
    } catch (e) {
      setOn(false);
      store.toast(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Bell size={13} style={{ verticalAlign: '-2px' }} /> Notifications</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        A daily nudge if you haven’t logged anything, and an alert when a budget goes over.
      </p>
      {supported ? (
        <label className="row-setting">
          <span>Push notifications</span>
          <input type="checkbox" className="switch" checked={on} disabled={busy}
            onChange={(e) => toggle(e.target.checked)} />
        </label>
      ) : (
        <p className="muted small">
          This browser doesn’t support push notifications. On iPhone, install RupeeFlow to your home screen first.
        </p>
      )}
    </div>
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
    if (usage[name]) return store.toast(`${name} is used by ${usage[name]} entries and can't be removed`);
    if (store.accounts.length <= 1) return store.toast('Keep at least one account');
    await store.saveAccounts(store.accounts.filter((a) => a !== name));
    store.toast(`Removed ${name}`);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Wallet size={13} style={{ verticalAlign: '-2px' }} /> Accounts</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Balances are derived from your ledger: income adds, expenses subtract, transfers move between accounts.
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
