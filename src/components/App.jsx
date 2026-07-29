'use client';
// App shell: auth gate, nav, animated view transitions, FAB cluster, modals, toast.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Mic, ScanLine, PenLine, Type } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import { readSharedPayload } from '@/lib/client/shareTarget';
import Landing from './Landing';
import Dashboard from './views/Dashboard';
import Ledger from './views/Ledger';
import Budgets from './views/Budgets';
import Insights from './views/Insights';
import Settings from './views/Settings';
import TxModal from './modals/TxModal';
import VoiceModal from './modals/VoiceModal';
import PromptModal from './modals/PromptModal';
import BudgetModal from './modals/BudgetModal';
import ExportModal from './modals/ExportModal';
import InstallPrompt from './InstallPrompt';
import ErrorBoundary from './ErrorBoundary';
import { Nav } from './Nav';

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

// The mini FABs stay mounted at all times and just toggle between these two
// variants — no AnimatePresence/mount-unmount involved. That was the source
// of the remaining "stuck, then drops" close feel: while exiting, the flex
// column-reverse layout still reserved full space for all three buttons
// until they actually unmounted, so the layout and the animation settled at
// different moments. A pure animate-prop toggle removes that mismatch.
const FAB_ITEM = {
  hidden: {
    opacity: 0, y: 14, scale: 0.5,
    transition: { type: 'spring', stiffness: 620, damping: 38, mass: 0.5, opacity: { duration: 0.1 } },
  },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: {
      type: 'spring', stiffness: 480, damping: 26, mass: 0.55, delay: i * 0.04,
      opacity: { duration: 0.14, delay: i * 0.04 },
    },
  }),
};
const FAB_ROTATE = { type: 'spring', stiffness: 500, damping: 26, mass: 0.5 };
const FAB_TAP = { scale: 0.9 };
const FAB_HOVER = { y: -1 };

const VIEWS = { dashboard: Dashboard, transactions: Ledger, budgets: Budgets, insights: Insights, settings: Settings };

export default function App() {
  const store = useStore();
  const [view, setViewState] = useState('dashboard');
  const [txModal, setTxModal] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [shareText, setShareText] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const fileRef = useRef(null);
  const fabRef = useRef(null);

  // remember sidebar preference
  useEffect(() => { setCollapsed(localStorage.getItem('rf_nav') === 'collapsed'); }, []);
  const toggleNav = (v) => { setCollapsed(v); localStorage.setItem('rf_nav', v ? 'collapsed' : 'open'); };

  // remember the active screen so a reload lands back where you were, not
  // always on the dashboard
  useEffect(() => {
    const saved = localStorage.getItem('rf_view');
    if (saved && VIEWS[saved]) setViewState(saved);
  }, []);
  const setView = (v) => { setViewState(v); localStorage.setItem('rf_view', v); };

  // Switching views shouldn't carry over the previous page's scroll position —
  // .main isn't its own scroll container, the window is, so it doesn't reset itself.
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  // close the FAB cluster on outside tap
  useEffect(() => {
    if (!fabOpen) return;
    const onDown = (e) => { if (!fabRef.current?.contains(e.target)) setFabOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [fabOpen]);

  // Share Target: another app shared text and/or a receipt photo into us
  // (see manifest.webmanifest + the POST handler in sw.js). Only consumed
  // once signed in — until then the payload stays in IndexedDB and the
  // ?share=1 marker stays in the URL, so it survives the login step.
  useEffect(() => {
    if (!store.booted || !store.token) return;
    let cancelled = false;
    (async () => {
      const payload = await readSharedPayload();
      if (cancelled || !payload) return;
      if (payload.image) scanReceipt(payload.image);
      else { setShareText(payload.text); setPromptOpen(true); }
    })();
    return () => { cancelled = true; };
  }, [store.booted, store.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!store.booted) return null;
  if (!store.token) return <Landing />;

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
      store.toast(`Found ${rupees(amount)} at ${out.merchant || 'store'}, review and save`);
    } catch (e) { store.toast('Receipt scan failed: ' + e.message); }
  }

  const ui = { view, setView, openTx, openBudget, openExport: () => setExportOpen(true) };
  const ActiveView = VIEWS[view] || Dashboard;

  const fabActions = [
    { key: 'voice', Icon: Mic, title: 'Speak an expense', onClick: () => { setFabOpen(false); setVoiceOpen(true); } },
    { key: 'scan', Icon: ScanLine, title: 'Scan a receipt', onClick: () => { setFabOpen(false); fileRef.current?.click(); } },
    { key: 'prompt', Icon: Type, title: 'Add by typing a sentence', onClick: () => { setFabOpen(false); setPromptOpen(true); } },
    { key: 'manual', Icon: PenLine, title: 'Add entry manually', onClick: () => { setFabOpen(false); openTx(); } },
  ];

  return (
    <UICtx.Provider value={ui}>
      <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
        <Nav view={view} setView={setView} collapsed={collapsed} setCollapsed={toggleNav} />
        <main className="main">
          {/* Plain key-remount + enter-only animation, deliberately NOT wrapped in
              AnimatePresence: mode="wait" has to fully finish the outgoing view's
              exit before mounting the next one, and a burst of store updates
              (exactly what adding an entry triggers) re-rendering the parent
              while that wait is in flight can leave it stuck indefinitely — the
              incoming view then sits at its initial (opacity: 0) state forever,
              i.e. a blank screen with nothing to unstick it but a reload. An
              instant swap with a fade-in has no wait step to get stuck in. */}
          <motion.div
            key={view}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <ErrorBoundary resetKey={view}>
              <ActiveView />
            </ErrorBoundary>
          </motion.div>
        </main>

        {/* + expands into Voice / Scan / Prompt / Manual and morphs into an X; tap again or pick one to close.
            Desktop stacks the minis in a column above the corner FAB; mobile reflows them into a
            horizontal pill above the centered tab-bar FAB instead (see .fab-minis in globals.css) —
            same buttons, same animation, just a different flex-direction/position per breakpoint. */}
        <div className={`fab-cluster ${fabOpen ? 'open' : ''}`} ref={fabRef}>
          <div className="fab-minis">
            {fabActions.map(({ key, Icon, title, onClick }, i) => (
              <motion.button key={key} className="fab mini" title={title} style={{ pointerEvents: fabOpen ? 'auto' : 'none' }}
                custom={i} variants={FAB_ITEM} initial="hidden" animate={fabOpen ? 'visible' : 'hidden'}
                whileHover={fabOpen ? FAB_HOVER : undefined} whileTap={fabOpen ? FAB_TAP : undefined}
                onClick={onClick}>
                <Icon size={18} strokeWidth={1.9} />
              </motion.button>
            ))}
          </div>
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
          {promptOpen && (
            <PromptModal key="prompt" initialText={shareText} onClose={() => { setPromptOpen(false); setShareText(null); }} />
          )}
          {budgetModal && <BudgetModal key="budget" category={budgetModal.category} onClose={() => setBudgetModal(null)} />}
          {exportOpen && <ExportModal key="export" onClose={() => setExportOpen(false)} />}
        </AnimatePresence>

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
