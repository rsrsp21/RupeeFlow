'use client';
// Custom categories panel — lives in Settings.
import { useState } from 'react';
import { Trash2, Tags } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import CategoryIcon from './CategoryIcon';
import ConfirmModal from './modals/ConfirmModal';

export default function CategoriesPanel() {
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
