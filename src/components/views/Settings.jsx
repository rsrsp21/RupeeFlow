
'use client';
import { useEffect, useState } from 'react';
// aliased — this module's own default export is already named Settings
import { Download, LogOut, RefreshCw, Plus, Wallet, Trash2, Pencil, Check, X, Bell, Settings as SettingsIcon, AlertTriangle, Tags } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, TAGLINE, ACCOUNT_TYPES, toPaise } from '@/lib/client/constants';
import { pushSupported, currentSubscription, enablePush, disablePush } from '@/lib/client/pushClient';
import { useUI } from '../App';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import AccountIcon from '../AccountIcon';
import CategoryIcon from '../CategoryIcon';
import ConfirmModal from '../modals/ConfirmModal';

export default function Settings() {
  const store = useStore();
  const { openExport } = useUI();
  const [dark, setDark] = useState(true);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
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
        <div><h2><SettingsIcon size={19} strokeWidth={2} /> Settings</h2><p className="sub">{store.name ? `${store.name} · ${store.email}` : store.email}</p></div>
        <div className="view-head-utils"><SyncBadge /><SettingsLink /></div>
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

      <CategoriesCard />

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
        <div className="acct-add" style={{ marginTop: 0 }}>
          <button className="btn ghost" onClick={() => { store.toast('Syncing…'); store.syncNow(); }}>
            <RefreshCw size={14} /> Sync now
          </button>
          <button className="btn ghost" onClick={async () => {
            store.toast('Re-fetching your full ledger…');
            await store.resync();
            store.toast('Resynced ✓');
          }}>
            <RefreshCw size={14} /> Force full resync
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Use a full resync if this device is showing an entry you already edited or deleted somewhere else.
        </p>
      </div>

      <div className="card">
        <h3>Account</h3>
        <NameRow />
        <button className="btn danger-ghost" onClick={store.logout}><LogOut size={14} /> Sign out</button>
      </div>

      <div className="card">
        <div className="card-head"><h3><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> Danger zone</h3></div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Permanently deletes your account and every entry, budget, and notification subscription tied to it. This can't be undone.
        </p>
        <button className="btn danger-ghost" onClick={() => setConfirmDeleteAccount(true)}>
          <Trash2 size={14} /> Delete account
        </button>
      </div>

      {confirmDeleteAccount && (
        <ConfirmModal
          title="Delete your account?"
          message={`Everything for ${store.email} — every entry, budget, and account — will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete account"
          onConfirm={() => { setConfirmDeleteAccount(false); store.deleteAccount(); }}
          onCancel={() => setConfirmDeleteAccount(false)}
        />
      )}

      <footer className="settings-foot">
        <svg viewBox="0 0 48 48" width="30" height="30"><use href="/icon.svg#mark" /></svg>
        <b>RupeeFlow</b>
        <span>{TAGLINE}</span>
      </footer>
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
      if (want) {
        await enablePush(store.api, () => {
          setOn(false);
          store.toast("Couldn't save that — check your connection and try again");
        });
        setOn(true); store.toast('Notifications on');
      } else {
        await disablePush(store.api); setOn(false); store.toast('Notifications off');
      }
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

function CategoriesCard() {
  const store = useStore();
  const [confirmRemove, setConfirmRemove] = useState(null); // the category object, or null
  if (!store.customCategories.length) return null;

  const usage = {};
  for (const t of store.live()) usage[t.category] = (usage[t.category] || 0) + 1;

  async function doRemove(c) {
    const moved = await store.removeCustomCategory(c.name);
    store.toast(moved ? `Deleted "${c.name}" · ${moved} ${moved === 1 ? 'entry' : 'entries'} moved to Other` : `Deleted "${c.name}"`);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Tags size={13} style={{ verticalAlign: '-2px' }} /> Custom categories</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Categories you created via "+ Custom" or an AI entry. Deleting one moves any entries using it to "Other".
      </p>
      <div className="acct-list">
        {store.customCategories.map((c) => (
          <div className="acct-row" key={c.name}>
            <CategoryIcon category={c.name} size={15} />
            <span className="acct-name">{c.name}</span>
            <span className="acct-count">{usage[c.name] || 0} entries</span>
            <button className="icon-btn" onClick={() => setConfirmRemove(c)} title="Delete category">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Delete this category?"
          message={`"${confirmRemove.name}" will be deleted.${usage[confirmRemove.name] ? ` ${usage[confirmRemove.name]} ${usage[confirmRemove.name] === 1 ? 'entry' : 'entries'} using it will move to "Other".` : ''} This can't be undone.`}
          onConfirm={() => { const c = confirmRemove; setConfirmRemove(null); doRemove(c); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
