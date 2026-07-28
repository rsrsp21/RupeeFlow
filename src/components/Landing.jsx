'use client';
// Marketing landing page shown to signed-out visitors — hero, feature
// highlights, then the actual sign-in/sign-up form at the bottom.
import { motion } from 'framer-motion';
import { Mic, ScanLine, Sparkles, Target, WifiOff, ShieldCheck, ArrowRight } from 'lucide-react';
import AuthView from './AuthView';

const FEATURES = [
  { Icon: Mic, title: 'Speak an expense', body: 'Say it naturally — "450 lunch, 120 auto to office" — and AI splits it into categorized entries.' },
  { Icon: ScanLine, title: 'Scan any receipt', body: 'Snap a photo. Merchant, total, date and category are read automatically.' },
  { Icon: Sparkles, title: 'AI-powered insights', body: 'A weekly review, a health score, and specific save/risk/win cards — grounded in your real data, not generic advice.' },
  { Icon: Target, title: 'Budgets that keep pace', body: 'Category budgets with day-of-month pacing, so you know you’re on track before the month ends.' },
  { Icon: WifiOff, title: 'Works fully offline', body: 'Installs as an app. Log expenses with no signal — it syncs the moment you’re back online.' },
  { Icon: ShieldCheck, title: 'Your data, your account', body: 'No bank linking, no data resale. Just your own ledger, secured behind your login.' },
];

export default function Landing() {
  const scrollToAuth = () => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <svg viewBox="0 0 48 48" width="26" height="26"><use href="/icon.svg#mark" /></svg>
          <span>RupeeFlow</span>
        </div>
        <button className="btn ghost sm" onClick={scrollToAuth}>Sign in</button>
      </header>

      <section className="landing-hero">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <span className="landing-eyebrow">₹ money tracking, minus the effort</span>
          <h1 className="landing-title">Know exactly where your money goes — without the spreadsheet.</h1>
          <p className="landing-sub">
            RupeeFlow is an AI-powered expense tracker built for India: speak or scan an expense,
            get a real budget with pacing, and a weekly review that actually says something useful.
          </p>
          <div className="landing-cta">
            <button className="btn primary" style={{ width: 'auto' }} onClick={scrollToAuth}>
              Get started free <ArrowRight size={15} />
            </button>
            <span className="muted small">Free · No card required · Installs as an app</span>
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

      <section id="auth" className="landing-auth">
        <AuthView />
      </section>
    </div>
  );
}
