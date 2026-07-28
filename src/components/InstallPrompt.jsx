'use client';
// "Add to home screen" prompt + persistent-storage request, so IndexedDB
// survives and the app opens offline like a native app.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X, Share } from 'lucide-react';

export default function InstallPrompt({ top = false }) {
  const [deferred, setDeferred] = useState(null);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('rf_install_dismissed') === '1') return;

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (standalone) {
      // Installed: ask the browser to keep our data (prevents eviction under storage pressure)
      navigator.storage?.persist?.().catch(() => {});
      return;
    }

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setDismissed(false); };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS Safari has no beforeinstallprompt — show manual instructions instead
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|chrome/i.test(navigator.userAgent);
    if (isIOS && isSafari) { setShowIOS(true); setDismissed(false); }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function close() {
    setDismissed(true);
    localStorage.setItem('rf_install_dismissed', '1');
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') navigator.storage?.persist?.().catch(() => {});
    setDeferred(null);
    close();
  }

  const visible = !dismissed && (deferred || showIOS);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div className={`install-prompt ${top ? 'top' : ''}`}
          initial={{ opacity: 0, y: top ? -20 : 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: top ? -20 : 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
          <div className="install-body">
            <b>Install RupeeFlow</b>
            <span>
              {showIOS
                ? <>Tap <Share size={12} style={{ verticalAlign: '-2px' }} /> then “Add to Home Screen.” Works offline after that.</>
                : 'Add it to your home screen to log expenses offline.'}
            </span>
          </div>
          {deferred && <button className="btn primary sm" style={{ width: 'auto' }} onClick={install}>
            <Download size={14} /> Install
          </button>}
          <button className="icon-btn" onClick={close} aria-label="Dismiss"><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
