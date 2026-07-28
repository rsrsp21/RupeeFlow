'use client';
import { useState } from 'react';
import { useStore } from '@/lib/client/store';

export default function AuthView() {
  const { authenticate } = useStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await authenticate(isRegister ? 'register' : 'login', email, password); }
    catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <div className="auth">
      <div className="auth-card fade-up">
        <div className="logo-lockup">
          <svg className="logo" viewBox="0 0 48 48" width="52" height="52"><use href="/icon.svg#mark" /></svg>
          <h1>RupeeFlow</h1>
          <p className="tagline">Money, minus the effort.</p>
        </div>
        <form onSubmit={submit} autoComplete="on">
          <input type="email" placeholder="Email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password (min 8 chars)" required minLength={8}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn primary" disabled={busy}>
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
    </div>
  );
}
