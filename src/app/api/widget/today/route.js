import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { q } from '@/lib/db';

// Data for the "Spent today" widget (see `widgets` in the manifest).
//
// Returns the shape the Adaptive Card template binds to, not raw rows — the
// widget host renders the card itself and cannot compute or format anything,
// so the strings arrive ready to display.
//
// Note this reads the SERVER's copy, so it reflects what has synced rather
// than what is sitting in an unsynced outbox on the phone. A widget cannot
// reach IndexedDB, so that is inherent rather than a shortcut.
export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);

    // The client's own day boundary — the server is UTC, which for an IST
    // user is still "yesterday" through the first five and a half hours.
    const url = new URL(request.url);
    const day = url.searchParams.get('day');
    const start = /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T00:00:00`).getTime()
      : new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const end = start + 86400000;

    const { rows } = await q(
      `SELECT COALESCE(SUM(amount), 0) AS paise, COUNT(*) AS n
         FROM transactions
        WHERE user_id = ? AND deleted = 0 AND type = 'expense'
          AND occurred_at >= ? AND occurred_at < ?`,
      [userId, start, end],
    );
    const paise = Number(rows?.[0]?.paise) || 0;
    const n = Number(rows?.[0]?.n) || 0;

    return jsonRes({
      spentToday: inr(paise),
      subtitle: n === 0 ? 'Nothing logged yet' : `${n} ${n === 1 ? 'entry' : 'entries'}`,
      paise,
      entries: n,
    });
  } catch (e) { return errRes(e); }
}

// Indian digit grouping, matching how the app renders every other figure —
// a widget showing 1,50,000 as 150,000 would look like a different product.
function inr(paise) {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
