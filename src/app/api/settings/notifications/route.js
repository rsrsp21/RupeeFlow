import { jsonRes, errRes, requireUser, HttpError } from '@/lib/auth';
import { q } from '@/lib/db';

export async function GET(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    
    const { rows } = await q(
      `SELECT notify_summary, notify_missed, notify_budget, notify_weekly, notify_midmonth 
       FROM users WHERE id = ?`, 
      [userId]
    );
    
    if (!rows.length) throw new HttpError('User not found', 404);
    
    return jsonRes(rows[0]);
  } catch (e) {
    return errRes(e);
  }
}

export async function POST(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const body = await request.json();

    const {
      notify_summary,
      notify_missed,
      notify_budget,
      notify_weekly,
      notify_midmonth
    } = body;

    await q(
      `UPDATE users SET 
        notify_summary = ?, 
        notify_missed = ?, 
        notify_budget = ?, 
        notify_weekly = ?, 
        notify_midmonth = ? 
       WHERE id = ?`,
      [
        notify_summary ? 1 : 0,
        notify_missed ? 1 : 0,
        notify_budget ? 1 : 0,
        notify_weekly ? 1 : 0,
        notify_midmonth ? 1 : 0,
        userId
      ]
    );

    return jsonRes({ ok: true });
  } catch (e) {
    return errRes(e);
  }
}
