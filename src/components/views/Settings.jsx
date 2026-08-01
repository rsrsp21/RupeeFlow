
'use client';
import { useEffect, useRef, useState } from 'react';
// aliased — this module's own default export is already named Settings
import { Download, Upload, LogOut, RefreshCw, Trash2, Pencil, Check, X, Bell, Smartphone, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { TAGLINE } from '@/lib/client/constants';
import { pushSupported, currentSubscription, enablePush, disablePush } from '@/lib/client/pushClient';
import { useUI } from '../App';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import MoneyLink from '../MoneyLink';
import ConfirmModal from '../modals/ConfirmModal';
import CategoriesPanel from '../CategoriesPanel';

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
        <div className="view-head-utils"><SyncBadge /><MoneyLink /><SettingsLink /></div>
      </header>

      <div className="card">
        <h3>Appearance</h3>
        <label className="row-setting">
          <span>Dark mode</span>
          <input type="checkbox" className="switch" checked={dark} onChange={(e) => toggleTheme(e.target.checked)} />
        </label>
      </div>

      <InstallCard />

      <NotificationsCard />

      <CategoriesPanel />

      <div className="card">
        <div className="card-head">
          <h3>Export &amp; backup</h3>
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          {counts} entries available. Choose format, timeline, filters and columns in the export builder.
        </p>
        <div className="acct-add" style={{ marginTop: 0 }}>
          <button className="btn ghost" onClick={openExport}><Download size={14} /> Open export builder</button>
          <RestoreButton />
        </div>
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
          Use a full resync if this device shows something you already changed elsewhere.
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

// The banner can be dismissed or snoozed, after which there was no way back
// to it — so installing also lives here permanently.
function InstallCard() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    // Same reasoning as InstallPrompt: standalone proves installation, and on
    // iOS it's the only proof there is, so it's remembered.
    if (standalone) { localStorage.setItem('rf_installed', '1'); setInstalled(true); return; }
    if (localStorage.getItem('rf_installed') === '1') { setInstalled(true); return; }
    const sync = () => setReady(Boolean(window.__rfInstall));
    sync();
    window.addEventListener('rf-installable', sync);
    window.addEventListener('rf-installed', () => setInstalled(true));
    return () => window.removeEventListener('rf-installable', sync);
  }, []);

  if (installed) return null;

  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function install() {
    const e = window.__rfInstall;
    if (!e) return;
    e.prompt();
    await e.userChoice.catch(() => {});
    window.__rfInstall = null;
    setReady(false);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Smartphone size={13} style={{ verticalAlign: '-2px' }} /> Install</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        {ready
          ? 'Adds RupeeFlow to your device. Opens instantly and works offline.'
          : isIOS
            ? 'In Safari, tap Share then "Add to Home Screen".'
            : 'Your browser hasn\'t offered an install yet — look for the install icon in the address bar, or reopen this page in Chrome or Edge.'}
      </p>
      {ready && (
        <button className="btn ghost" onClick={install}><Download size={14} /> Install app</button>
      )}
    </div>
  );
}

function RestoreButton() {
  const store = useStore();
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // parsed backup awaiting confirmation
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = Array.isArray(data?.transactions) ? data.transactions.length : 0;
      if (!n) return store.toast('No entries found in that file');
      setPending({ data, n, when: data.exported_at ? new Date(data.exported_at).toLocaleDateString('en-IN') : null });
    } catch { store.toast("Couldn't read that file — it needs to be a RupeeFlow JSON export"); }
  }

  async function apply() {
    const backup = pending;
    setPending(null);
    setBusy(true);
    store.toast('Restoring…');
    try {
      const c = await store.importBackup(backup.data);
      store.toast(`Restored ${c.entries} ${c.entries === 1 ? 'entry' : 'entries'}${c.skipped ? ` · ${c.skipped} already up to date` : ''}`);
    } catch (err) { store.toast('Restore failed: ' + err.message); }
    setBusy(false);
  }

  return (
    <>
      <button className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload size={14} /> Restore from backup
      </button>
      <input type="file" accept="application/json,.json" hidden ref={fileRef} onChange={pick} />
      {pending && (
        <ConfirmModal
          title="Restore this backup?"
          message={`${pending.n} ${pending.n === 1 ? 'entry' : 'entries'}${pending.when ? ` from ${pending.when}` : ''} will be merged in. Nothing is deleted — anything you've changed since stays as it is, and entries already here keep their newer version.`}
          confirmLabel="Restore"
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </>
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
  
  const [prefs, setPrefs] = useState({
    notify_summary: 1,
    notify_missed: 1,
    notify_budget: 1,
    notify_weekly: 1,
    notify_midmonth: 1
  });
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Reflect the browser's actual state — the user may have revoked
  // permission or cleared site data since they last turned this on.
  useEffect(() => {
    if (!supported) return;
    currentSubscription().then((s) => setOn(!!s && Notification.permission === 'granted')).catch(() => {});
  }, [supported]);

  useEffect(() => {
    if (on) {
      const cached = localStorage.getItem('rf_notify_prefs');
      if (cached) {
        try {
          setPrefs(JSON.parse(cached));
        } catch (e) {
          // ignore parse error
        }
      } else {
        setPrefsLoading(true);
        store.api('/settings/notifications').then((data) => {
          setPrefs(data);
          localStorage.setItem('rf_notify_prefs', JSON.stringify(data));
          setPrefsLoading(false);
        }).catch(() => setPrefsLoading(false));
      }
    }
  }, [on, store]);

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

  async function togglePref(key, val) {
    const next = { ...prefs, [key]: val ? 1 : 0 };
    setPrefs(next);
    localStorage.setItem('rf_notify_prefs', JSON.stringify(next));
    try {
      await store.api('/settings/notifications', {
        method: 'POST',
        body: JSON.stringify(next)
      });
    } catch (e) {
      store.toast("Failed to save preference: " + e.message);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Bell size={13} style={{ verticalAlign: '-2px' }} /> Notifications</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Sent daily at 10:00 PM. Turn on what you want to hear about.
      </p>
      {supported ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="row-setting">
            <span>Push notifications</span>
            <input type="checkbox" className="switch" checked={on} disabled={busy}
              onChange={(e) => toggle(e.target.checked)} />
          </label>
          
          {on && !prefsLoading && (
            <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="row-setting">
                <span>Daily Summary</span>
                <input type="checkbox" className="switch" checked={!!prefs.notify_summary}
                  onChange={(e) => togglePref('notify_summary', e.target.checked)} />
              </label>
              <label className="row-setting">
                <span>Missed entries nudge</span>
                <input type="checkbox" className="switch" checked={!!prefs.notify_missed}
                  onChange={(e) => togglePref('notify_missed', e.target.checked)} />
              </label>
              <label className="row-setting">
                <span>Budget alerts</span>
                <input type="checkbox" className="switch" checked={!!prefs.notify_budget}
                  onChange={(e) => togglePref('notify_budget', e.target.checked)} />
              </label>
              <label className="row-setting">
                <span>Weekly review</span>
                <input type="checkbox" className="switch" checked={!!prefs.notify_weekly}
                  onChange={(e) => togglePref('notify_weekly', e.target.checked)} />
              </label>
              <label className="row-setting">
                <span>Mid-month check</span>
                <input type="checkbox" className="switch" checked={!!prefs.notify_midmonth}
                  onChange={(e) => togglePref('notify_midmonth', e.target.checked)} />
              </label>
            </div>
          )}
        </div>
      ) : (
        <p className="muted small">
          This browser doesn’t support push notifications. On iPhone, install RupeeFlow to your home screen first.
        </p>
      )}
    </div>
  );
}
