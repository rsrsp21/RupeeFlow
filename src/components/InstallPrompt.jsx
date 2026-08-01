'use client';
// "Install RupeeFlow" — a real install button where the browser offers one,
// and manual instructions on iOS Safari, which has no install API at all.
//
// This used to ignore `beforeinstallprompt` on the assumption that Chrome and
// Edge show their own install UI. They largely don't any more: Android's
// mini-infobar was removed years ago, and on desktop it's a small omnibox
// icon that's easy to miss entirely. Skipping the event meant there was no
// install affordance anywhere except iOS. Capturing it gives a button that
// opens the browser's own installer on click.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Share, Download } from 'lucide-react';

// Shown on every load until the app is actually installed. Dismissing hides
// it for the current page only, deliberately: a persisted opt-out is what
// made it invisible for good after one stray tap.
//
// "Is it installed" has no direct answer from a browser tab —
// getInstalledRelatedApps() only covers a linked native app, not the PWA
// itself. Standalone display mode answers a narrower question: how THIS tab
// was opened. That's enough on Android and desktop, where Chrome simply
// stops firing beforeinstallprompt once installed. iOS Safari has neither,
// so an installed user browsing the site normally would be nagged forever —
// hence the flag below: launching standalone proves installation happened,
// and that fact is worth remembering.
const INSTALLED_KEY = 'rf_installed';
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // the browser's install event
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (standalone) {
      // Proof of installation, and the only proof iOS will ever give us.
      localStorage.setItem(INSTALLED_KEY, '1');
      // Installed: ask the browser to keep our data (prevents eviction under storage pressure)
      navigator.storage?.persist?.().catch(() => {});
      return;
    }
    const knownInstalled = localStorage.getItem(INSTALLED_KEY) === '1';

    // The event itself is caught by an inline script in the document head —
    // it fires before React hydrates, so a listener attached here would
    // always be too late. All this does is pick up whatever that already
    // stashed, and listen for it arriving later.
    const take = () => {
      if (!window.__rfInstall) return;
      setDeferred(window.__rfInstall);
    };
    take();
    window.addEventListener('rf-installable', take);

    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1');
      setDeferred(null); setShowIOS(false);
    };
    window.addEventListener('rf-installed', onInstalled);

    // Android and desktop need no such guard: the browser stops offering
    // beforeinstallprompt once installed, so `deferred` stays null by itself.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|chrome/i.test(navigator.userAgent);
    if (isIOS && isSafari && !knownInstalled) setShowIOS(true);

    return () => {
      window.removeEventListener('rf-installable', take);
      window.removeEventListener('rf-installed', onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    // The event is single-use either way, so the banner goes regardless of
    // what they chose — re-showing it would need a fresh event anyway.
    await deferred.userChoice.catch(() => {});
    window.__rfInstall = null; // single-use
    setDeferred(null);
  }

  // Session-only: it returns on the next load, and stops for good once the
  // app is installed.
  function close() { setDismissed(true); }

  const open = !dismissed && (deferred || showIOS);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="install-prompt"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
          <div className="install-body">
            <b>Install RupeeFlow</b>
            {deferred
              ? <span>Add it to your device — opens instantly and works offline.</span>
              : <span>Tap <Share size={12} style={{ verticalAlign: '-2px' }} /> then “Add to Home Screen.” Works offline after that.</span>}
          </div>
          {deferred && (
            <button className="btn primary sm" style={{ width: 'auto' }} onClick={install}>
              <Download size={13} /> Install
            </button>
          )}
          <button className="icon-btn" onClick={close} aria-label="Dismiss"><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
