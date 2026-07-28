'use client';
// App shell: auth gate, nav, animated view transitions, FAB cluster, modals, toast.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Mic, ScanLine, PenLine } from 'lucide-react';
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
import ExportModal from './modals/ExportModal';
import OfflineBanner from './OfflineBanner';
import InstallPrompt from './InstallPrompt';
import { Nav } from './Nav';

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

// Mini FABs stagger in on open; on close they all retreat together, quickly,
// so the cluster doesn't feel like it's lagging behind the "+" as it un-rotates.
// Their transform is driven ONLY by these variants — no CSS transition on
// .fab.mini's transform — otherwise the two animation systems fight and stutter.
const FAB_ITEM = {
  hidden: { opacity: 0, y: 10, scale: .6 },
  visible: (i) => ({ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, delay: i * 0.035, ease: 'easeOut' } }),
  exit: { opacity: 0, y: 6, scale: .6, transition: { duration: 0.12, ease: 'easeIn' } },
};
const FAB_ROTATE = { duration: 0.15, ease: 'easeInOut' };
const FAB_TAP = { scale: 0.92 };
const FAB_HOVER = { y: -1 };

const VIEWS = { dashboard: Dashboard, transactions: Ledger, budgets: Budgets, insights: Insights, settings: Settings };

export default function App() {
  const store = useStore();
  const [view, setView] = useState('dashboard');
  const [txModal, setTxModal] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [budgetModal, setBudgetModal] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const fileRef = useRef(null);
  const fabRef = useRef(null);

  // remember sidebar preference
  useEffect(() => { setCollapsed(localStorage.getItem('rf_nav') === 'collapsed'); }, []);
  const toggleNav = (v) => { setCollapsed(v); localStorage.setItem('rf_nav', v ? 'collapsed' : 'open'); };

  // close the FAB cluster on outside tap
  useEffect(() => {
    if (!fabOpen) return;
    const onDown = (e) => { if (!fabRef.current?.contains(e.target)) setFabOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [fabOpen]);

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

  const ui = { view, setView, openTx, openBudget, openExport: () => setExportOpen(true) };
  const ActiveView = VIEWS[view] || Dashboard;

  const fabActions = [
    { key: 'voice', Icon: Mic, title: 'Speak an expense', onClick: () => { setFabOpen(false); setVoiceOpen(true); } },
    { key: 'scan', Icon: ScanLine, title: 'Scan a receipt', onClick: () => { setFabOpen(false); fileRef.current?.click(); } },
    { key: 'manual', Icon: PenLine, title: 'Add entry manually', onClick: () => { setFabOpen(false); openTx(); } },
  ];

  return (
    <UICtx.Provider value={ui}>
      <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
        <Nav view={view} setView={setView} collapsed={collapsed} setCollapsed={toggleNav} />
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

        {/* + expands into Manual / Scan / Voice and morphs into an X; tap again or pick one to close */}
        <div className={`fab-cluster ${fabOpen ? 'open' : ''}`} ref={fabRef}>
          <AnimatePresence>
            {fabOpen && fabActions.map(({ key, Icon, title, onClick }, i) => (
              <motion.button key={key} className="fab mini" title={title}
                custom={i} variants={FAB_ITEM} initial="hidden" animate="visible" exit="exit"
                whileHover={FAB_HOVER} whileTap={FAB_TAP}
                onClick={onClick}>
                <Icon size={18} strokeWidth={1.9} />
              </motion.button>
            ))}
          </AnimatePresence>
          <button className="fab main-fab" title={fabOpen ? 'Close' : 'Add entry'} onClick={() => setFabOpen((v) => !v)}>
            <motion.span className="fab-plus" animate={{ rotate: fabOpen ? 45 : 0 }} transition={FAB_ROTATE}>
              <Plus size={22} strokeWidth={2.2} />
            </motion.span>
          </button>
        </div>
        <input type="file" ref={fileRef} accept="image/*" capture="environment" hidden
          onChange={(e) => { if (e.target.files[0]) scanReceipt(e.target.files[0]); e.target.value = ''; }} />

        <AnimatePresence>
          {txModal && <TxModal key="tx" state={txModal} onClose={() => setTxModal(null)} />}
          {voiceOpen && <VoiceModal key="voice" onClose={() => setVoiceOpen(false)} />}
          {budgetModal && <BudgetModal key="budget" category={budgetModal.category} onClose={() => setBudgetModal(null)} />}
          {exportOpen && <ExportModal key="export" onClose={() => setExportOpen(false)} />}
        </AnimatePresence>

        <OfflineBanner />
        <InstallPrompt />
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
