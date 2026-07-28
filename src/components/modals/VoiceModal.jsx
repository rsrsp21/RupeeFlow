'use client';
// Natural speech → categorized ledger entries (Gemini transcribes + parses).
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './TxModal';

export default function VoiceModal({ onClose }) {
  const store = useStore();
  const [status, setStatus] = useState('Listening… speak naturally');
  const [thinking, setThinking] = useState(false);
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);

  useEffect(() => {
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        recorder.current = new MediaRecorder(stream.current, { mimeType: mime });
        recorder.current.ondataavailable = (e) => chunks.current.push(e.data);
        recorder.current.start();
      } catch { setStatus('Microphone unavailable — check permissions'); }
    })();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function finish() {
    const rec = recorder.current;
    if (!rec || rec.state !== 'recording') { onClose(); return; }
    setThinking(true);
    setStatus('Understanding…');
    const stopped = new Promise((res) => (rec.onstop = res));
    rec.stop(); await stopped;
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      const blob = new Blob(chunks.current, { type: rec.mimeType });
      const b64 = await blobToB64(blob);
      const out = await store.api('/ai/voice', {
        method: 'POST',
        body: JSON.stringify({ audio: b64, mimeType: rec.mimeType, projects: store.projects() }),
      });
      await addEntries(out);
    } catch (e) { store.toast('Could not process audio: ' + e.message); }
    onClose();
  }

  async function addEntries(out) {
    const entries = out?.transactions || [];
    if (!entries.length) { store.toast(`Heard: "${out?.transcript || '…'}" — no amounts found`); return; }
    let added = 0, sum = 0;
    for (const e of entries) {
      const amount = Math.round((Number(e.amount_rupees) || 0) * 100);
      if (amount <= 0) continue;
      // spoken dates ("on 26th July", "yesterday") come back as YYYY-MM-DD
      let occurred = Date.now();
      if (e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        const t = new Date(e.date + 'T12:00:00').getTime();
        if (Number.isFinite(t)) occurred = t;
      } else if (e.occurred_at_offset_days) {
        occurred += (Number(e.occurred_at_offset_days) || 0) * 86400000;
      }
      await store.saveTx({
        id: crypto.randomUUID(),
        type: ['expense', 'income', 'transfer'].includes(e.type) ? e.type : 'expense',
        amount,
        category: CATEGORIES[e.category] ? e.category : 'Other',
        note: String(e.note || '').slice(0, 200),
        project: String(e.project || '').slice(0, 60),
        account: 'Cash', to_account: '',
        occurred_at: occurred,
        created_at: Date.now(), updated_at: Date.now(), rev: 1, deleted: 0, source: 'voice',
      });
      added++; sum += amount;
    }
    store.toast(added ? `Added ${added} ${added > 1 ? 'entries' : 'entry'} · ${rupees(sum)} ✓` : 'No valid amounts found');
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}>
      <motion.div className="modal voice-modal" {...panelMotion}>
        <div className={`mic-orb ${thinking ? 'thinking' : ''}`}>
          <Mic size={30} strokeWidth={1.8} />
        </div>
        <p>{status}</p>
        <p className="muted small">“450 lunch with client for Acme project, 120 auto to office”</p>
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={finish} disabled={thinking}>Done</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});
