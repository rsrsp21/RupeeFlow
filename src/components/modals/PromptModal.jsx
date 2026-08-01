'use client';
// Type a sentence about spending → Gemini splits it into ledger entries.
// Same parsing schema as VoiceModal, just skipping the microphone.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { applyParsedTransactions } from '@/lib/client/applyParsed';
import { backdropMotion, panelMotion } from './TxModal';

export default function PromptModal({ onClose, initialText }) {
  const store = useStore();
  const [text, setText] = useState(initialText || '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const out = await store.api('/ai/parse', {
        method: 'POST', body: JSON.stringify({ text: v, history: store.noteHistory().slice(0, 60), customCategories: store.customCategories.map((c) => c.name), holdings: store.holdings.map((h) => h.name) }),
      });
      const { added, sum } = await applyParsedTransactions(store, out, 'text');
      store.toast(added ? `Added ${added} ${added > 1 ? 'entries' : 'entry'} · ${rupees(sum)} ✓` : 'No amounts found in that');
      onClose();
    } catch (err) {
      store.toast('Could not parse that: ' + err.message);
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" {...panelMotion}>
        <div className="modal-head">
          <h3>Quick add by text</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <textarea autoFocus rows={3} placeholder="450 lunch with client, 120 auto to office"
            value={text} onChange={(e) => setText(e.target.value)} />
          <p className="muted small" style={{ marginTop: 8 }}>
            Describe one or more expenses in a sentence: dates and categories are picked up automatically.
          </p>
          <button className="btn primary" type="submit" disabled={busy || !text.trim()} style={{ marginTop: 14 }}>
            {busy ? 'Parsing…' : 'Add entries'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
