'use client';
import { useState } from 'react';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { PASSWORD_RULES } from '@/lib/passwordRules';
import { TAGLINE } from '@/lib/client/constants';

export default function AuthView({ onClose }) {
  const { authenticate } = useStore();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ruleResults = PASSWORD_RULES.map((r) => ({ label: r.label, met: r.test(password) }));
  const passwordOk = !isRegister || ruleResults.every((r) => r.met);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await authenticate(isRegister ? 'register' : 'login', email, password, name); }
    catch (err) { setError(err.message); }
    setBusy(false);
  }

  const card = (
    <div className="auth-card fade-up">
      {onClose && (
        <button type="button" className="icon-btn auth-close" onClick={onClose} aria-label="Close">
          <X size={17} />
        </button>
      )}
      <div className="logo-lockup">
        <svg className="logo" viewBox="0 0 48 48" width="52" height="52"><use href="/icon.svg#mark" /></svg>
        <h1>RupeeFlow</h1>
        <p className="tagline">{TAGLINE}</p>
      </div>
      <form onSubmit={submit} autoComplete="on">
        {isRegister && (
          <input type="text" placeholder="Name (optional)" autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input type="email" placeholder="Email" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="password-field">
          <input type={showPassword ? 'text' : 'password'} placeholder="Password" required minLength={8}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="icon-btn password-eye" tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)} title={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {isRegister && (
          <ul className="password-checklist">
            {ruleResults.map((r) => (
              <li key={r.label} className={r.met ? 'met' : ''}>
                {r.met ? <Check size={12} strokeWidth={2.6} /> : <X size={12} strokeWidth={2.2} />} {r.label}
              </li>
            ))}
          </ul>
        )}
        <button type="submit" className="btn primary" disabled={busy || !passwordOk}>
          {isRegister ? 'Create account' : 'Sign in'}
        </button>
        <p className="auth-switch">
          {isRegister ? 'Have an account? ' : 'New here? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(!isRegister); }}>
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
