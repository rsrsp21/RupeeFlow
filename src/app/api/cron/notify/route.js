// Scheduled push sender: a nudge for users who logged nothing today, plus
// budget-overspend alerts. Meant to be hit once a day by a scheduler
// (vercel.json's cron, or any external cron) with the CRON_SECRET bearer.
export const runtime = 'nodejs';
export const maxDuration = 60;

import { jsonRes, errRes, HttpError } from '@/lib/auth';
import { sendToUser } from '@/lib/push';
import { q } from '@/lib/db';

// The app is India-first and monthKey()/startOfDay() are computed in the
// user's local time on the client. Servers run UTC, so shift by IST to keep
// "today" and "this month" meaning the same thing on both sides.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const rupees = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export async function POST(request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization') || '';
    if (!secret || auth !== `Bearer ${secret}`) throw new HttpError('Unauthorized', 401);

    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    const monthKey = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, '0')}`;
    const dayStart = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST_OFFSET_MS;
    const tomorrowStart = dayStart + 24 * 60 * 60 * 1000;
    const monthStart = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1) - IST_OFFSET_MS;
    const monthEnd = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() + 1, 1) - IST_OFFSET_MS;
    const weekStart = dayStart - 7 * 24 * 60 * 60 * 1000;

    const isSunday = nowIst.getUTCDay() === 0;
    const isMidMonth = nowIst.getUTCDate() === 15;

    const [subs, loggedToday, spendRows, budgetRows, todaySpendRows, weekSpendRows] = await Promise.all([
      q(`SELECT DISTINCT p.user_id, u.notify_summary, u.notify_missed, u.notify_budget, u.notify_weekly, u.notify_midmonth 
         FROM push_subscriptions p JOIN users u ON p.user_id = u.id`),
      q('SELECT DISTINCT user_id FROM transactions WHERE deleted = 0 AND created_at >= ?', [dayStart]),
      q(`SELECT user_id, category, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id, category`, [monthStart, monthEnd]),
      q('SELECT user_id, category, amount FROM budgets WHERE month = ?', [monthKey]),
      q(`SELECT user_id, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id`, [dayStart, tomorrowStart]),
      isSunday ? q(`SELECT user_id, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id`, [weekStart, dayStart]) : { rows: [] }
    ]);

    const active = new Set(loggedToday.rows.map((r) => r.user_id));

    const todaySpend = new Map(todaySpendRows.rows.map(r => [r.user_id, Number(r.spent) || 0]));
    const weekSpend = new Map(weekSpendRows.rows.map(r => [r.user_id, Number(r.spent) || 0]));

    // user_id -> { total, byCategory }
    const spend = new Map();
    for (const r of spendRows.rows) {
      if (!spend.has(r.user_id)) spend.set(r.user_id, { total: 0, byCategory: {} });
      const s = spend.get(r.user_id);
      const amt = Number(r.spent) || 0;
      s.total += amt;
      s.byCategory[r.category] = (s.byCategory[r.category] || 0) + amt;
    }

    const overspend = new Map(); // user_id -> first breached budget
    for (const b of budgetRows.rows) {
      const s = spend.get(b.user_id);
      if (!s || overspend.has(b.user_id)) continue;
      const spent = b.category ? (s.byCategory[b.category] || 0) : s.total;
      const budget = Number(b.amount) || 0;
      if (budget > 0 && spent > budget) {
        overspend.set(b.user_id, { label: b.category || 'Monthly budget', over: spent - budget, budget });
      }
    }

    let sent = 0;
    for (const u of subs.rows) {
      const userId = u.user_id;

      // 1. Budget Alerts
      if (u.notify_budget !== 0) {
        const breach = overspend.get(userId);
        if (breach) {
          sent += await sendToUser(userId, {
            title: `Over budget: ${breach.label}`,
            body: `You're ${rupees(breach.over)} past your ${rupees(breach.budget)} budget this month.`,
            tag: 'budget-alert',
            url: '/?view=budgets',
          });
        }
      }

      // 2. Mid-month check
      if (isMidMonth && u.notify_midmonth !== 0) {
        const s = spend.get(userId);
        if (s && s.total > 0) {
          sent += await sendToUser(userId, {
            title: 'Mid-Month Check',
            body: `Halfway through the month! You've spent ${rupees(s.total)} so far.`,
            tag: 'midmonth-check',
            url: '/?view=insights',
          });
        }
      }

      // 3. Weekly Review (Sundays)
      if (isSunday && u.notify_weekly !== 0) {
        const wSpend = weekSpend.get(userId);
        if (wSpend && wSpend > 0) {
          sent += await sendToUser(userId, {
            title: 'Weekly Review',
            body: `You spent ${rupees(wSpend)} in the last 7 days. Tap to review.`,
            tag: 'weekly-review',
            url: '/?view=insights',
          });
        }
      }

      // 4. Daily Summary vs Missed Nudge
      const tSpend = todaySpend.get(userId) || 0;
      if (tSpend > 0) {
        if (u.notify_summary !== 0) {
          sent += await sendToUser(userId, {
            title: 'Daily Summary',
            body: `You logged ${rupees(tSpend)} in expenses today.`,
            tag: 'daily-summary',
            url: '/?view=transactions',
          });
        }
      } else {
        if (u.notify_missed !== 0 && !active.has(userId)) {
          sent += await sendToUser(userId, {
            title: 'Log today’s expenses',
            body: 'Nothing recorded yet today. It takes a few seconds.',
            tag: 'daily-reminder',
            url: '/?action=add',
          });
        }
      }
    }

    return jsonRes({ ok: true, candidates: subs.rows.length, sent });
  } catch (e) { return errRes(e); }
}

// Vercel Cron issues GET requests; same handler, same auth check.
export const GET = POST;
