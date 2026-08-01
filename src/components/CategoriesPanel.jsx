'use client';
// Custom categories panel — lives in Settings.
import { useState } from 'react';
import { Trash2, Tags, Pencil, Check, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import CategoryIcon from './CategoryIcon';
import ConfirmModal from './modals/ConfirmModal';

export default function CategoriesPanel() {
  const store = useStore();
  const [confirmRemove, setConfirmRemove] = useState(null); // the category object, or null
  const [editing, setEditing] = useState(null); // category name being renamed
  const [editVal, setEditVal] = useState('');
  const [busy, setBusy] = useState(false);
  if (!store.customCategories.length) return null;

  const usage = {};
  for (const t of store.live()) usage[t.category] = (usage[t.category] || 0) + 1;

  // Renaming rewrites every transaction tagged with the old name too — see
  // store.renameCustomCategory — so entries don't end up pointing at a
  // category that no longer exists.
  async function saveRename(c) {
    const v = editVal.trim();
    if (!v || v === c.name) { setEditing(null); return; }
    setBusy(true);
    try {
      const moved = await store.renameCustomCategory(c.name, v);
      setEditing(null);
      store.toast(moved ? `Renamed · ${moved} ${moved === 1 ? 'entry' : 'entries'} updated` : 'Renamed');
    } catch (err) { store.toast(err.message || 'Could not rename'); }
    setBusy(false);
  }

  async function doRemove(c) {
    const moved = await store.removeCustomCategory(c.name);
    store.toast(moved ? `Deleted "${c.name}" · ${moved} ${moved === 1 ? 'entry' : 'entries'} moved to Other` : `Deleted "${c.name}"`);
  }

  return (
    <div className="card">
      <div className="card-head"><h3><Tags size={13} style={{ verticalAlign: '-2px' }} /> Custom categories</h3></div>
      <p className="muted small" style={{ marginBottom: 12 }}>Renaming updates every entry; deleting moves them to &quot;Other&quot;.</p>
      <div className="acct-list">
        {store.customCategories.map((c) => (
          <div className="acct-row" key={c.name}>
            <CategoryIcon category={c.name} size={15} />
            {editing === c.name ? (
              <form className="cat-rename" onSubmit={(e) => { e.preventDefault(); saveRename(c); }}>
                <input autoFocus maxLength={60} value={editVal} onChange={(e) => setEditVal(e.target.value)} />
                <button className="icon-btn" type="submit" disabled={busy} title="Save"><Check size={13} /></button>
                <button className="icon-btn" type="button" onClick={() => setEditing(null)} title="Cancel"><X size={13} /></button>
              </form>
            ) : (
              <>
                <span className="acct-name">{c.name}</span>
                <span className="acct-count">{usage[c.name] || 0} entries</span>
                <button className="icon-btn" title="Rename category"
                  onClick={() => { setEditing(c.name); setEditVal(c.name); }}>
                  <Pencil size={13} />
                </button>
              </>
            )}
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
