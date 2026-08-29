'use client';
// Natural speech → categorized ledger entries (Gemini transcribes + parses).
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { todayISO } from '@/lib/client/period';
import { applyParsedTransactions } from '@/lib/client/applyParsed';
import { backdropMotion, panelMotion } from './TxModal';
import { useUI } from '../App';

export default function VoiceModal({ onClose }) {
  const store = useStore();
  const { entryDate, entryAccount } = useUI();
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
      } catch { setStatus('Microphone unavailable. Check permissions.'); }
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
        body: JSON.stringify({ audio: b64, mimeType: rec.mimeType, history: store.noteHistory().slice(0, 60), customCategories: store.customCategories.map((c) => c.name), holdings: store.realHoldings.map((h) => h.name), accounts: store.accounts.map((a) => a.name), groups: store.groupNames().slice(0, 30), today: todayISO() }),
      });
      const { added, sum } = await applyParsedTransactions(store, out, 'voice',
        { fallbackDate: entryDate, fallbackAccount: entryAccount, today: todayISO() });
      store.toast(added ? `Added ${added} ${added > 1 ? 'entries' : 'entry'} · ${rupees(sum)} ✓` : `Heard: "${out?.transcript || '…'}", no amounts found`);
    } catch (e) { store.toast('Could not process audio: ' + e.message); }
    onClose();
  }

  return (
    <motion.div className="modal-backdrop" {...backdropMotion}>
      <motion.div className="modal voice-modal" {...panelMotion}>
        <div className={`mic-orb ${thinking ? 'thinking' : ''}`}>
          <Mic size={30} strokeWidth={1.8} />
        </div>
        <p>{status}</p>
        <p className="muted small">“450 lunch with client, 120 auto to office”</p>
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
