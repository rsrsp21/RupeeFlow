'use client';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ className = '' }) {
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const toggle = () => {
    const el = document.documentElement;
    el.dataset.theme = el.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('rf_theme', el.dataset.theme);
  };
  return (
    <button className={`icon-btn theme-toggle ${className}`} onClick={toggle} title="Toggle theme">
      {isDark ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
    </button>
  );
}
