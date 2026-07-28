'use client';
// App shell: auth gate, nav, animated view transitions, FAB cluster, modals, toast.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Mic, ScanLine } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import AuthView from './AuthView';
import Dashboard from './views/Dashboard';
import Ledger from './views/Ledger';
import Budgets from './views/Budgets';
import Insights from './views/Insights';
import Settings from './views/Settings';
import TxModal from './modals/TxModal';
import VoiceModal from './modals/VoiceModal';
import BudgetModal from './modals/BudgetModal';
import { Nav } from './Nav';

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

const VIEWS = { dashboard: Dashboard, transactions: Ledger, budgets: Budgets, insights: Insights, settings: Settings };

export default function App() {
  const store = useStore();
  const [view, setView] = useState('dashboard');
  const [txModal, setTxModal] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [budgetModal, setBudgetModal] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const fileRef = useRef(null);
  const fabRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (fabRef.current && !fabRef.current.contains(e.target)) setFabOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  if (!store.booted) return null;
  if (!store.token) return <AuthView />;

  const openTx = (arg) => setTxModal(arg || {});
  const openBudget = (category = '') => setBudgetModal({ category });

  async function scanReceipt(file) {
    store.toast('Reading receipt…');
    try {
      const b64 = await downscaleImage(file, 1280);
      const out = await store.api('/ai/receipt', {
        method: 'POST', body: JSON.stringify({ image: b64, mimeType: 'image/jpeg' }),
      });
      const amount = Math.round((Number(out.total_rupees) || 0) * 100);
      if (amount <= 0) { store.toast('Could not read a total from that photo'); return; }
      const occurred = out.date ? new Date(out.date + 'T12:00:00').getTime() : Date.now();
      openTx({
        prefill: {
          type: 'expense', amount,
          note: out.merchant || 'Receipt',
          category: CATEGORIES[out.category] ? out.category : 'Shopping',
          occurred_at: Number.isFinite(occurred) ? occurred : Date.now(),
          source: 'receipt',
        },
      });
      store.toast(`Found ${rupees(amount)} at ${out.merchant || 'store'} — review and save`);
    } catch (e) { store.toast('Receipt scan failed: ' + e.message); }
  }

  const ui = { view, setView, openTx, openBudget };
  const ActiveView = VIEWS[view] || Dashboard;

  return (
    <UICtx.Provider value={ui}>
      <div className="app">
        <Nav view={view} setView={setView} />
        <main className="main">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <ActiveView />
            </motion.div>
          </AnimatePresence>
        </main>

        <div className="fab-cluster" ref={fabRef}>
          <motion.button
            className="fab main-fab" title="Add entry"
            animate={{ rotate: fabOpen ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={() => { if (fabOpen) { setFabOpen(false); openTx(); } else setFabOpen(true); }}
          >
            <Plus size={22} strokeWidth={2.2} />
          </motion.button>
          <AnimatePresence>
            {fabOpen && (
              <>
                <motion.button
                  key="scan" className="fab mini" title="Scan a receipt"
                  initial={{ opacity: 0, y: 12, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  onClick={() => { setFabOpen(false); fileRef.current?.click(); }}
                >
                  <ScanLine size={18} strokeWidth={1.9} />
                </motion.button>
                <motion.button
                  key="voice" className="fab mini" title="Speak an expense"
                  initial={{ opacity: 0, y: 12, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32, delay: 0.04 }}
                  onClick={() => { setFabOpen(false); setVoiceOpen(true); }}
                >
                  <Mic size={18} strokeWidth={1.9} />
                </motion.button>
              </>
            )}
          </AnimatePresence>
        </div>
        <input type="file" ref={fileRef} accept="image/*" capture="environment" hidden
          onChange={(e) => { if (e.target.files[0]) scanReceipt(e.target.files[0]); e.target.value = ''; }} />

        <AnimatePresence>
          {txModal && <TxModal key="tx" state={txModal} onClose={() => setTxModal(null)} />}
          {voiceOpen && <VoiceModal key="voice" onClose={() => setVoiceOpen(false)} />}
          {budgetModal && <BudgetModal key="budget" category={budgetModal.category} onClose={() => setBudgetModal(null)} />}
        </AnimatePresence>

        <div className={`toast ${store.toastMsg ? 'show' : ''}`}>{store.toastMsg}</div>
      </div>
    </UICtx.Provider>
  );
}

function downscaleImage(file, maxW) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
