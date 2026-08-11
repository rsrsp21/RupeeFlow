'use client';
// Add/edit/delete an entry. Deletes are soft (deleted=1) and every edit bumps
// rev + updated_at, so history stays consistent on every synced device.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Tag, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import AmountInput from '../AmountInput';
import { CATEGORIES, AUTO_RULES, rupees, toPaise } from '@/lib/client/constants';
import { normalizeNote, normalizeGroup } from '@/lib/noteMatch';
import { resolveCategory } from '@/lib/client/applyParsed';
import CategoryIcon from '../CategoryIcon';
import ConfirmModal from './ConfirmModal';

export const backdropMotion = {
  initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
  transition: { duration: 0.15 },
};
export const panelMotion = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
  transition: { type: 'spring', stiffness: 420, damping: 34 },
};

export default function TxModal({ state, onClose }) {
  const store = useStore();
  const existing = state.id ? store.txs[state.id] : null;
  const pre = state.prefill || {};

  // "invest" isn't its own stored type — the transactions table constrains
  // type to expense/income/transfer, and an investment IS a transfer, just
  // one whose destination is a holding rather than a spendable account. It's
  // a separate tab purely so the form can offer the right destination list.
  const isHoldingName = (n) => store.holdings.some((h) => h.name === n);
  const openedAs = existing
    ? (existing.type === 'transfer' && isHoldingName(existing.to_account) ? 'invest' : existing.type)
    : (pre.type || 'expense');

  const [type, setType] = useState(openedAs);
  const [amount, setAmount] = useState(existing ? existing.amount / 100 : pre.amount ? pre.amount / 100 : '');
  const [note, setNote] = useState(existing?.note ?? pre.note ?? '');
  // A trip/event this entry belongs to, e.g. "Goa Trip" — free text, no
  // separate entity, matched case-insensitively against past groups so
  // typing "goa trip" reuses the same group as an earlier "Goa Trip" rather
  // than silently forking a second one (see normalizeGroup).
  const [group, setGroup] = useState(existing?.project ?? pre.project ?? '');
  // Collapsed unless there's already a group on this entry — most entries
  // don't belong to one, so a permanent field would be noise for the common
  // case.
  const [groupOpen, setGroupOpen] = useState(!!(existing?.project || pre.project));
  const [category, setCategory] = useState(existing?.category || pre.category || 'Food & Dining');
  const [account, setAccount] = useState(existing?.account || pre.account || store.accounts[0]?.name || '');
  // Defaulting to a literal 'Bank' used to invent a destination that wasn't
  // in the user's account list at all, which silently made transfers vanish
  // from every total. Empty is honest — save() refuses to write without one.
  const [toAccount, setToAccount] = useState(existing?.to_account || '');
  const [holding, setHolding] = useState(
    openedAs === 'invest' ? (existing?.to_account || '') : (store.holdings[0]?.name || ''));
  // Both tabs move money between places rather than spending or earning it,
  // so neither wants a category picker.
  const isMove = type === 'transfer' || type === 'invest';
  const [date, setDate] = useState(() => {
    const d = new Date(Number(existing?.occurred_at ?? pre.occurred_at ?? Date.now()));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [noteFocused, setNoteFocused] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  // The note an edit opened with — used below to tell "just opened this
  // entry" apart from "actually retyped the note while editing it", so
  // autofill can work for edits too without silently re-categorizing an
  // untouched entry the instant its modal opens.
  const [openedWithNote] = useState(existing?.note ?? pre.note ?? '');

  // note history, keyed by normalized text (quantity/units stripped) so
  // "chicken 300g" and "chicken 300 grams" resolve to the same past entry
  const history = useMemo(() => store.noteHistory(), [store.txs]); // eslint-disable-line react-hooks/exhaustive-deps
  const historyIndex = useMemo(() => new Map(history.map((h) => [h.key, h])), [history]);
  const noteKey = normalizeNote(note);
  const matches = useMemo(() => {
    if (noteKey.length < 2) return [];
    return history.filter((h) => h.key !== noteKey && h.key.includes(noteKey)).slice(0, 8);
  }, [history, noteKey]);

  // auto-fill category from the user's own history first, since it reflects
  // what they actually picked before; fall back to keyword rules. Skipped
  // for an edit until the note actually changes from what it opened with —
  // otherwise opening an entry to fix, say, just the amount would silently
  // flip a category you'd deliberately picked differently back to whatever
  // history/rules suggest for that same unchanged note.
  useEffect(() => {
    if (existing && note === openedWithNote) return;
    const hit = noteKey && historyIndex.get(noteKey);
    if (hit) {
      setCategory(hit.category);
      return;
    }
    for (const [re, cat] of AUTO_RULES) if (re.test(note)) { setCategory(cat); break; }
  }, [note, noteKey, existing, historyIndex]);

  function pickSuggestion(m) {
    setNote(m.note);
    setCategory(m.category);
    setAmount((a) => (a === '' ? String(m.amount / 100) : a));
    setNoteFocused(false);
  }

  async function aiCategorize() {
    const v = note.trim();
    if (!v || aiBusy) return;
    setAiBusy(true);
    try {
      const out = await store.api('/ai/categorize', {
        method: 'POST',
        body: JSON.stringify({
          note: v, history: history.slice(0, 40).map((h) => ({ note: h.note, category: h.category })),
          customCategories: store.customCategories.map((c) => c.name),
        }),
      });
      if (out?.category) {
        const resolved = await resolveCategory(store, out.category);
        setCategory(resolved);
        store.toast(`Categorized as ${resolved}`);
      } else store.toast('Could not determine a category');
    } catch (e) { store.toast('AI categorize failed: ' + e.message); }
    setAiBusy(false);
  }

  async function save(e) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!Number.isFinite(paise) || paise <= 0) return store.toast('Enter a valid amount');
    if (!account) return store.toast('Pick an account');
    if (type === 'transfer' && !toAccount) return store.toast('Pick a destination account');
    if (type === 'transfer' && account === toAccount) return store.toast('Pick two different accounts');
    if (type === 'invest' && !holding) return store.toast('Pick where this is going');
    const destination = type === 'invest' ? holding : type === 'transfer' ? toAccount : '';
    const base = existing ? new Date(Number(existing.occurred_at)) : new Date();
    const [y, m, d] = date.split('-').map(Number);
    const occurred = new Date(y, m - 1, d, base.getHours(), base.getMinutes()).getTime();
    const t = {
      id: existing?.id || crypto.randomUUID(),
      // invest is stored as a transfer — see the comment where `type` is set up
      type: type === 'invest' ? 'transfer' : type,
      amount: paise,
      category: type === 'transfer' || type === 'invest' ? 'Other' : category,
      note: note.trim(),
      account, to_account: destination,
      project: group.trim(),
      occurred_at: occurred,
      created_at: existing?.created_at || Date.now(),
      updated_at: Date.now(),
      rev: (existing?.rev || 0) + 1,
      deleted: 0,
      source: existing?.source || pre.source || 'manual',
    };
    await store.saveTx(t);
    onClose();
    store.toast(existing ? 'Entry updated ✓' : `Added ${rupees(paise)} ✓`);
  }

  async function remove() {
    // (existing.rev || 0) not existing.rev — an entry predating the rev field
    // makes this NaN, which the server clamps back down to rev 1, throwing
    // away the delete's version tiebreak entirely (see the LWW merge below).
    await store.saveTx({ ...existing, deleted: 1, updated_at: Date.now(), rev: (existing.rev || 0) + 1 });
    onClose();
    store.toast('Entry deleted, totals recalculated');
  }

  async function createCategory() {
    const nm = newCatName.trim();
    if (!nm || catBusy) return;
    setCatBusy(true);
    try {
      const saved = await store.addCustomCategory(nm);
      setCategory(saved.name);
      setAddingCategory(false);
      setNewCatName('');
      store.toast(`Added "${saved.name}" category ✓`);
    } catch (err) { store.toast('Could not create category: ' + err.message); }
    setCatBusy(false);
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3>{existing ? 'Edit entry' : 'Add entry'}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={save}>
          <div className="seg">
            {['expense', 'income', 'transfer', 'invest'].map((t) => (
              <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>
                {t === 'invest' ? 'Invest/Save' : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="amount-input">
            <span>₹</span>
            <AmountInput placeholder="0" required autoFocus
              value={amount} onChange={setAmount} />
          </div>
          <div className="note-field">
            <input placeholder="What was it? (auto-fills from past entries)" autoComplete="off"
              value={note} onChange={(e) => setNote(e.target.value)}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setTimeout(() => setNoteFocused(false), 120)} />
            {noteFocused && matches.length > 0 && (
              <ul className="note-suggest">
                {matches.map((m) => (
                  <li key={m.key} onMouseDown={() => pickSuggestion(m)}>
                    <CategoryIcon category={m.category} size={12} />
                    <span className="note-suggest-text">{m.note}</span>
                    <em>{m.category}</em>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!groupOpen ? (
            <button type="button" className="btn ghost sm" onClick={() => setGroupOpen(true)}>
              <Tag size={13} /> Add to a group
            </button>
          ) : (
            <div className="new-cat-row">
              <input list="tx-group-list" placeholder="Trip or event (e.g. Goa Trip)" autoComplete="off"
                value={group} onChange={(e) => setGroup(e.target.value)}
                onBlur={() => {
                  // Snap to an existing group's exact casing so a near-match
                  // typed by hand can't silently fork its total in two.
                  const key = normalizeGroup(group);
                  if (!key) return;
                  const canon = store.groupNames().find((g) => normalizeGroup(g) === key);
                  if (canon && canon !== group) setGroup(canon);
                }} />
              <datalist id="tx-group-list">
                {store.groupNames().map((g) => <option key={g} value={g} />)}
              </datalist>
              <button type="button" className="icon-btn" title="Remove group"
                onClick={() => { setGroup(''); setGroupOpen(false); }}>
                <X size={14} />
              </button>
            </div>
          )}
          {!isMove && (
            <button type="button" className="btn ghost sm ai-cat-btn" onClick={aiCategorize} disabled={aiBusy || !note.trim()}>
              <Sparkles size={13} className={aiBusy ? 'spin' : ''} /> Auto-categorize with AI
            </button>
          )}
          {!isMove && !addingCategory && (
            <div className="new-cat-row">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {[...Object.keys(CATEGORIES), ...store.customCategories.map((c) => c.name)].map((c) => <option key={c}>{c}</option>)}
              </select>
              <button type="button" className="btn ghost sm" onClick={() => setAddingCategory(true)}>+ Custom</button>
            </div>
          )}
          {!isMove && addingCategory && (
            <div className="new-cat-row">
              <input autoFocus placeholder="Name your category (e.g. Pets, Hobbies)" maxLength={60}
                value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }} />
              <button type="button" className="btn ghost sm" onClick={createCategory} disabled={catBusy || !newCatName.trim()}>
                <Sparkles size={12} className={catBusy ? 'spin' : ''} /> {catBusy ? 'Generating icon…' : 'Create'}
              </button>
              <button type="button" className="icon-btn" title="Cancel"
                onClick={() => { setAddingCategory(false); setNewCatName(''); }}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="form-row labelled">
            <label>
              <span>{isMove ? 'From account' : type === 'income' ? 'Into account' : 'Paid from'}</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="" disabled>Select…</option>
                {store.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
            </label>
            {type === 'transfer' && (
              <label>
                <span>To account</span>
                <select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {store.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </label>
            )}
            {type === 'invest' && (
              <label>
                <span>Into</span>
                <select value={holding} onChange={(e) => setHolding(e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {store.holdings.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {type === 'invest' && !store.holdings.length && (
            <p className="muted small">
              No savings or investments set up yet — add one on the Savings screen first, then you can move money into it here.
            </p>
          )}
          <div className="btn-row">
            {existing && <button type="button" className="btn danger-ghost" onClick={() => setConfirmDelete(true)}>Delete</button>}
            <button type="submit" className="btn primary grow">Save</button>
          </div>
        </form>
      </motion.div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete this entry?"
          message={`"${note.trim() || category}" · ${rupees(toPaise(amount) || 0)} will be removed from your ledger. This can't be undone.`}
          onConfirm={() => { setConfirmDelete(false); remove(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </motion.div>
  );
}
