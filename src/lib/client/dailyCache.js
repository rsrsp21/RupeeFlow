// Persist a value in localStorage, valid until local midnight — used for AI
// results (coach, recurring, weekly review, chat) so switching views doesn't
// throw away an analysis the user already paid an API call for, but it also
// doesn't linger stale forever (a Refresh/Rescan button always overrides it).
const todayKey = () => new Date().toDateString();

export function loadDaily(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { day, value } = JSON.parse(raw);
    return day === todayKey() ? value : null;
  } catch { return null; }
}

export function saveDaily(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ day: todayKey(), value })); } catch {}
}
