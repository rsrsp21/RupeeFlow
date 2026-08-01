'use client';
// App shell: auth gate, nav, animated view transitions, FAB cluster, modals, toast.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Mic, ScanLine, PenLine, Type, Wallet } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import { readSharedPayload } from '@/lib/client/shareTarget';
import { resolveCategory } from '@/lib/client/applyParsed';
import Landing from './Landing';
import TxModal from './modals/TxModal';
import VoiceModal from './modals/VoiceModal';
import PromptModal from './modals/PromptModal';
import BudgetModal from './modals/BudgetModal';
import ExportModal from './modals/ExportModal';
import AddAccountModal from './modals/AddAccountModal';
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

// Screens are real routes now, so the browser's own history stack does the
// work: back walks the screens you actually visited and only exits from the
// first one. View ids are kept as the UI's vocabulary (every setView('budgets')
// call site still reads the same) and mapped to paths here.
const PATHS = {
  dashboard: '/', transactions: '/ledger', money: '/money',
  budgets: '/budgets', insights: '/insights', settings: '/settings',
};
const VIEW_BY_PATH = Object.fromEntries(Object.entries(PATHS).map(([v, p]) => [p, v]));

export default function App({ children }) {
  const store = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const view = VIEW_BY_PATH[pathname] || 'dashboard';
  const [txModal, setTxModal] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [shareText, setShareText] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  // Set by Ledger while it's browsing a single specific day (not "today",
  // not a week/month/year view) — lets a manually-added entry default to
  // that day instead of always defaulting to right now.
  const [entryDate, setEntryDate] = useState(null);
  const fileRef = useRef(null);
  const fabRef = useRef(null);

  // "Add your first account" shows once for a genuinely new signup (zero
  // accounts) and auto-closes itself the moment that's no longer true —
  // whether because they added one here, or store.jsx derived one from real
  // transaction history in the background (an existing user's case; see the
  // comment there). Re-showing on every load is suppressed once skipped.
  useEffect(() => {
    if (!store.booted || !store.token) return;
    // Zero accounts is only conclusive once the first sync has actually
    // resolved — before that it just means this device/browser has no local
    // cache yet, not that the account is new (see store.jsx's comment on
    // firstSyncDone).
    if (store.accounts.length === 0 && !store.firstSyncDone) return;
    const skipped = localStorage.getItem('rf_onboard_skip') === '1';
    setOnboardOpen(store.accounts.length === 0 && !skipped);
  }, [store.booted, store.token, store.accounts.length, store.firstSyncDone]);

  // remember sidebar preference
  useEffect(() => { setCollapsed(localStorage.getItem('rf_nav') === 'collapsed'); }, []);
  const toggleNav = (v) => { setCollapsed(v); localStorage.setItem('rf_nav', v ? 'collapsed' : 'open'); };

  // A reload already lands back where you were — the URL says so.
  const setView = (v) => router.push(PATHS[v] || '/');

  // Screens used to be a state swap with nothing to fetch; as routes, each
  // one is its own JS chunk plus an RSC payload, so a cold first tap pays a
  // round trip that never existed before. Nav is a fixed handful of screens
  // and the user will visit most of them, so warm them all once — after
  // that, switching is as instant as the state swap was. Nothing else
  // prefetches them: router.push() from a button gets none of the treatment
  // <Link> would give it.
  useEffect(() => {
    if (!store.token) return;
    for (const path of Object.values(PATHS)) router.prefetch(path);
  }, [store.token, router]);

  // Switching views shouldn't carry over the previous page's scroll position —
  // .main isn't its own scroll container, the window is, so it doesn't reset itself.
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  // The daily-reminder push notification links to /?action=add so tapping it
  // jumps straight to the entry sheet instead of just opening the dashboard.
  // Read directly off window.location rather than useSearchParams(), which
  // forces every page consuming it into a Suspense boundary for static
  // export — not worth it for a one-shot read on mount. Stripped from the
  // URL immediately so it doesn't reopen on every reload.
  useEffect(() => {
    if (!store.token) return;
    if (new URLSearchParams(window.location.search).get('action') !== 'add') return;
    setTxModal(entryDate ? { prefill: { occurred_at: entryDate } } : {});
    router.replace(pathname);
  }, [store.token, pathname, router, entryDate]);

  // Leaving a screen must not leave a sheet floating over the next one.
  useEffect(() => { closeModals(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back should dismiss an open sheet before it leaves the screen — that's
  // muscle memory on Android. Opening one adds a history entry at the SAME
  // url (pushState with no url argument), so popping it changes nothing the
  // router cares about; it just tells us to close. The entry is wound back
  // when a sheet is dismissed through the UI instead, so it can't pile up.
  const anyModal = Boolean(txModal || budgetModal || exportOpen || voiceOpen || promptOpen);
  const pushedForModal = useRef(false);
  useEffect(() => {
    if (anyModal && !pushedForModal.current) {
      pushedForModal.current = true;
      window.history.pushState({ rfModal: true }, '');
    } else if (!anyModal && pushedForModal.current) {
      pushedForModal.current = false;
      if (window.history.state?.rfModal) window.history.back();
    }
  }, [anyModal]);
  useEffect(() => {
    const onPop = () => {
      if (!pushedForModal.current) return;
      pushedForModal.current = false;
      closeModals();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function closeModals() {
    setTxModal(null); setBudgetModal(null); setExportOpen(false);
    setVoiceOpen(false); setPromptOpen(false); setShareText(null); setFabOpen(false);
  }

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
  // InstallPrompt is mounted once by the route layout, outside this
  // component — mounting it on both sides of this auth gate meant crossing
  // it swapped one instance for a fresh one, so the banner came back and had
  // to be dismissed a second time.
  if (!store.token) return <Landing />;

  // A bare openTx() (new manual entry, no explicit prefill — e.g. the FAB)
  // defaults to the day Ledger is currently browsing, if it's browsing one.
  const openTx = (arg) => setTxModal(arg || (entryDate ? { prefill: { occurred_at: entryDate } } : {}));
  const openBudget = (category = '') => setBudgetModal({ category });

  async function scanReceipt(file) {
    store.toast('Reading receipt…');
    try {
      const b64 = await downscaleImage(file, 1280);
      const out = await store.api('/ai/receipt', {
        method: 'POST', body: JSON.stringify({
          image: b64, mimeType: 'image/jpeg', history: store.noteHistory().slice(0, 60),
          customCategories: store.customCategories.map((c) => c.name),
          accounts: store.accounts.map((a) => a.name)
        }),
      });
      const amount = Math.round((Number(out.total_rupees) || 0) * 100);
      if (amount <= 0) { store.toast('Could not read a total from that photo'); return; }
      const occurred = out.date ? new Date(out.date + 'T12:00:00').getTime() : Date.now();
      const category = await resolveCategory(store, out.category);
      
      const accountName = out.account ? store.accounts.find(a => a.name.toLowerCase() === out.account.toLowerCase())?.name : null;
      
      openTx({
        prefill: {
          type: 'expense', amount,
          note: out.merchant || 'Receipt',
          category,
          account: accountName || undefined,
          occurred_at: Number.isFinite(occurred) ? occurred : Date.now(),
          source: 'receipt',
        },
      });
      store.toast(`Found ${rupees(amount)} at ${out.merchant || 'store'}, review and save`);
    } catch (e) { store.toast('Receipt scan failed: ' + e.message); }
  }

  const ui = { view, setView, openTx, openBudget, openExport: () => setExportOpen(true), setEntryDate };

  const fabActions = [
    { key: 'voice', Icon: Mic, label: 'Speak', title: 'Speak an expense', onClick: () => { setFabOpen(false); setVoiceOpen(true); } },
    { key: 'scan', Icon: ScanLine, label: 'Scan', title: 'Scan a receipt', onClick: () => { setFabOpen(false); fileRef.current?.click(); } },
    { key: 'prompt', Icon: Type, label: 'Type', title: 'Add by typing a sentence', onClick: () => { setFabOpen(false); setPromptOpen(true); } },
    { key: 'manual', Icon: PenLine, label: 'Manual', title: 'Add entry manually', onClick: () => { setFabOpen(false); openTx(); } },
  ];

  return (
    <UICtx.Provider value={ui}>
      <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
        <Nav view={view} setView={setView} collapsed={collapsed} setCollapsed={toggleNav} />
        <main className="main">
          {/* Nudge on every screen while there's no account to record entries
              against — not just at onboarding, since "Maybe later" leaves
              accounts empty indefinitely. Disappears the moment one exists. */}
          {store.accounts.length === 0 && (
            <div className="no-account-notice">
              <Wallet size={14} />
              <span>You should <a href="#" onClick={(e) => { e.preventDefault(); setView('settings'); }}>add an account in Settings</a> to start recording entries.</span>
            </div>
          )}
          {/* Plain key-remount + enter-only animation, deliberately NOT wrapped in
              AnimatePresence: mode="wait" has to fully finish the outgoing view's
              exit before mounting the next one, and a burst of store updates
              (exactly what adding an entry triggers) re-rendering the parent
              while that wait is in flight can leave it stuck indefinitely — the
              incoming view then sits at its initial (opacity: 0) state forever,
              i.e. a blank screen with nothing to unstick it but a reload. An
              instant swap with a fade-in has no wait step to get stuck in. */}
          {/* opacity-only: Framer Motion keeps a `transform` style applied for any
              animated x/y/scale even at rest, and a transformed ancestor breaks
              position: sticky for every .view-head nested inside it — the
              sticky header just silently never stuck to anything. */}
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <ErrorBoundary resetKey={pathname}>
              {children}
            </ErrorBoundary>
          </motion.div>
        </main>

        {/* + expands into Voice / Scan / Prompt / Manual and morphs into an X; tap again or pick one to close.
            Desktop stacks the minis in a column above the corner FAB; mobile reflows them into a
            horizontal pill above the centered tab-bar FAB instead (see .fab-minis in globals.css) —
            same buttons, same animation, just a different flex-direction/position per breakpoint. */}
        <div className={`fab-cluster ${fabOpen ? 'open' : ''}`} ref={fabRef}>
          <div className="fab-minis">
            {fabActions.map(({ key, Icon, label, title, onClick }, i) => (
              <motion.button key={key} className="fab mini" title={title} style={{ pointerEvents: fabOpen ? 'auto' : 'none' }}
                custom={i} variants={FAB_ITEM} initial="hidden" animate={fabOpen ? 'visible' : 'hidden'}
                whileHover={fabOpen ? FAB_HOVER : undefined} whileTap={fabOpen ? FAB_TAP : undefined}
                onClick={onClick}>
                <Icon size={18} strokeWidth={1.9} />
                <span className="fab-label">{label}</span>
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
          {onboardOpen && (
            <AddAccountModal
              key="onboard"
              onDone={() => { setOnboardOpen(false); setView('transactions'); openTx(); }}
              onSkip={() => { localStorage.setItem('rf_onboard_skip', '1'); setOnboardOpen(false); }}
            />
          )}
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
