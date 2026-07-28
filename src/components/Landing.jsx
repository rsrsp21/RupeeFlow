'use client';
// Marketing landing page shown to signed-out visitors: hero and feature
// highlights, with sign-in/sign-up opening as a modal rather than a section.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, ScanLine, Sparkles, Target, WifiOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { TAGLINE } from '@/lib/client/constants';
import { backdropMotion, panelMotion } from './modals/TxModal';
import AuthView from './AuthView';
import ThemeToggle from './ThemeToggle';
import InstallPrompt from './InstallPrompt';

const FEATURES = [
  { Icon: Mic, title: 'Speak an expense', body: 'Say it naturally, like "450 lunch, 120 auto to office," and AI splits it into categorized entries.' },
  { Icon: ScanLine, title: 'Scan any receipt', body: 'Snap a photo. Merchant, total, date and category are read automatically.' },
  { Icon: Sparkles, title: 'AI-powered insights', body: 'A weekly review, a health score, and specific save/risk/win cards, grounded in your real data, not generic advice.' },
  { Icon: Target, title: 'Budgets that keep pace', body: 'Category budgets with day-of-month pacing, so you know you’re on track before the month ends.' },
  { Icon: WifiOff, title: 'Works fully offline', body: 'Installs as an app. Log expenses with no signal, and it syncs the moment you’re back online.' },
  { Icon: ShieldCheck, title: 'Your data, your account', body: 'No bank linking, no data resale. Just your own ledger, secured behind your login.' },
];

const PREVIEW_BARS = [38, 62, 45, 80, 55, 96, 70];

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <svg viewBox="0 0 48 48" width="26" height="26"><use href="/icon.svg#mark" /></svg>
          <span>RupeeFlow</span>
        </div>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <button className="btn ghost sm" onClick={() => setAuthOpen(true)}>Sign in</button>
        </div>
      </header>

      <section className="landing-hero">
        <motion.div className="landing-hero-text"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className="landing-title">Know exactly where your money goes, without the spreadsheet.</h1>
          <p className="landing-sub">
            RupeeFlow is an AI-powered expense tracker built for India: speak or scan an expense,
            get a real budget with pacing, and a weekly review that actually says something useful.
          </p>
          <div className="landing-cta">
            <button className="btn primary" style={{ width: 'auto' }} onClick={() => setAuthOpen(true)}>
              Get started free <ArrowRight size={15} />
            </button>
            <span className="muted small">Free · No card required · Installs as an app</span>
          </div>
        </motion.div>

        <motion.div className="landing-preview"
          initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
          <div className="landing-preview-head">
            <span>Net balance</span>
            <b>₹18,240</b>
          </div>
          <div className="landing-preview-bars">
            {PREVIEW_BARS.map((h, i) => (
              <motion.span key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
            ))}
          </div>
          <div className="landing-preview-stats">
            <div><em>Spent</em><b>₹42,180</b></div>
            <div><em>Budget used</em><b>78%</b></div>
            <div><em>Saved</em><b className="good">₹6,500</b></div>
          </div>
        </motion.div>
      </section>

      <section className="landing-features">
        {FEATURES.map(({ Icon, title, body }, i) => (
          <motion.div className="landing-feature" key={title}
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}>
            <span className="landing-feature-ico"><Icon size={18} strokeWidth={1.8} /></span>
            <h3>{title}</h3>
            <p>{body}</p>
          </motion.div>
        ))}
      </section>

      <footer className="landing-footer">
        <div className="landing-brand">
          <svg viewBox="0 0 48 48" width="20" height="20"><use href="/icon.svg#mark" /></svg>
          <span>RupeeFlow</span>
        </div>
        <p>{TAGLINE}</p>
        <p className="muted small">© {new Date().getFullYear()} RupeeFlow · Created by Sri Ram Sai Pavan Relangi</p>
      </footer>

      <AnimatePresence>
        {authOpen && (
          <motion.div className="modal-backdrop" {...backdropMotion}
            onClick={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
            <motion.div {...panelMotion}>
              <AuthView onClose={() => setAuthOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <InstallPrompt />
    </div>
  );
}
