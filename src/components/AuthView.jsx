'use client';
// Sign-in is a single screen; registration is split into three steps
// (email -> password -> name) so no single step outgrows the fixed-size card
// and needs a scrollbar. All steps stay mounted in one <form>, so Enter
// advances naturally and native validation applies per visible step.
import { useState } from 'react';
import { Eye, EyeOff, Check, X, ArrowLeft } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { PASSWORD_RULES } from '@/lib/passwordRules';
import { TAGLINE } from '@/lib/client/constants';

const STEP_HINTS = ['Create your account', 'Choose a password', 'What should we call you?'];
const LAST_STEP = 2;

export default function AuthView({ onClose }) {
  const { authenticate } = useStore();
  const [isRegister, setIsRegister] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ruleResults = PASSWORD_RULES.map((r) => ({ label: r.label, met: r.test(password) }));
  const passwordOk = ruleResults.every((r) => r.met);

  function switchMode(toRegister) {
    setIsRegister(toRegister);
    setStep(0);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    // Register advances a step instead of submitting until the last one.
    if (isRegister && step < LAST_STEP) { setStep((s) => s + 1); return; }
    setBusy(true);
    try { await authenticate(isRegister ? 'register' : 'login', email, password, name); }
    catch (err) { setError(err.message); }
    setBusy(false);
  }

  // Shared by the login screen and register step 2 — a plain helper (not a
  // component) so it can't remount and drop focus as `step` changes.
  const passwordField = (autoComplete, autoFocus) => (
    <div className="password-field">
      <input type={showPassword ? 'text' : 'password'} placeholder="Password" required minLength={8}
        autoComplete={autoComplete} autoFocus={autoFocus}
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="button" className="icon-btn password-eye" tabIndex={-1}
        onClick={() => setShowPassword((v) => !v)} title={showPassword ? 'Hide password' : 'Show password'}>
        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );

  const submitLabel = !isRegister ? 'Sign in' : step < LAST_STEP ? 'Continue' : 'Create account';
  const canSubmit = !busy && (!isRegister || step !== 1 || passwordOk);

  const card = (
    <div className="auth-card fade-up">
      {onClose && (
        <button type="button" className="icon-btn auth-close" onClick={onClose} aria-label="Close">
          <X size={17} />
        </button>
      )}
      {isRegister && step > 0 && (
        <button type="button" className="icon-btn auth-back" aria-label="Back"
          onClick={() => { setStep((s) => s - 1); setError(''); }}>
          <ArrowLeft size={17} />
        </button>
      )}
      <div className="logo-lockup">
        <svg className="logo" viewBox="0 0 48 48" width="52" height="52"><use href="/icon.svg#mark" /></svg>
        <h1>RupeeFlow</h1>
        <p className="tagline">{isRegister ? STEP_HINTS[step] : TAGLINE}</p>
      </div>

      {isRegister && (
        <div className="auth-steps" aria-hidden="true">
          {STEP_HINTS.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
      )}

      <form onSubmit={submit} autoComplete="on">
        {!isRegister && (
          <>
            <input type="email" placeholder="Email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {passwordField('current-password', false)}
          </>
        )}

        {isRegister && step === 0 && (
          <input type="email" placeholder="Email" required autoComplete="email" autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} />
        )}

        {isRegister && step === 1 && (
          <>
            {passwordField('new-password', true)}
            <ul className="password-checklist">
              {ruleResults.map((r) => (
                <li key={r.label} className={r.met ? 'met' : ''}>
                  {r.met ? <Check size={12} strokeWidth={2.6} /> : <X size={12} strokeWidth={2.2} />} {r.label}
                </li>
              ))}
            </ul>
          </>
        )}

        {isRegister && step === LAST_STEP && (
          <input type="text" placeholder="Name (optional)" autoComplete="name" autoFocus
            value={name} onChange={(e) => setName(e.target.value)} />
        )}

        <button type="submit" className="btn primary" disabled={!canSubmit}>{submitLabel}</button>

        <p className="auth-switch">
          {isRegister ? 'Have an account? ' : 'New here? '}
          <a href="#" onClick={(e) => { e.preventDefault(); switchMode(!isRegister); }}>
            {isRegister ? 'Sign in instead' : 'Create an account'}
          </a>
        </p>
        <p className="auth-error">{error}</p>
      </form>
    </div>
  );

  if (onClose) return card;
  return <div className="auth">{card}</div>;
}
