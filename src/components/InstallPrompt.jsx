'use client';
// iOS-only "Add to Home Screen" tip, plus a persistent-storage request so
// IndexedDB survives and the app opens offline like a native app.
//
// Chrome/Edge/Android already show their own native install prompt (the
// omnibox icon or mini-infobar) — we deliberately do NOT listen for
// beforeinstallprompt or call preventDefault() on it, so that native browser
// UI is what users see there, not a custom in-app popup. iOS Safari has no
// such native prompt at all, so it's the one platform that still needs a
// manual nudge here.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Share } from 'lucide-react';

// Showing it once and then staying quiet for a few days reads as helpful;
// showing it on every single reload reads as nagging. A hard "X" dismiss
// opts out forever; just seeing it starts this softer cooldown too.
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (standalone) {
      // Installed: ask the browser to keep our data (prevents eviction under storage pressure)
      navigator.storage?.persist?.().catch(() => {});
      return;
    }

    if (localStorage.getItem('rf_install_dismissed') === '1') return;
    if (Date.now() < Number(localStorage.getItem('rf_install_snooze_until') || 0)) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|chrome/i.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowIOS(true);
      setDismissed(false);
      localStorage.setItem('rf_install_snooze_until', String(Date.now() + SNOOZE_MS));
    }
  }, []);

  function close() {
    setDismissed(true);
    localStorage.setItem('rf_install_dismissed', '1');
  }

  return (
    <AnimatePresence>
      {showIOS && !dismissed && (
        <motion.div className="install-prompt"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
          <div className="install-body">
            <b>Install RupeeFlow</b>
            <span>Tap <Share size={12} style={{ verticalAlign: '-2px' }} /> then “Add to Home Screen.” Works offline after that.</span>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Dismiss"><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
