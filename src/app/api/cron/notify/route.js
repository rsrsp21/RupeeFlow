// Scheduled push sender. Three distinct daily slots, driven by ?slot= on the
// same endpoint — each one says something different, since firing the same
// "log your expenses" nudge three times a day is spam, not help:
//   morning — recap of YESTERDAY's spend, closes the loop on the day before
//   evening — today's summary (or a first nudge if nothing's logged yet),
//             plus budget alerts, weekly review (Sundays), mid-month check
//   late    — a second, final nudge, but ONLY if still nothing logged since
//             the evening run — never a duplicate, always an escalation
// Meant to be hit by three separate external cron triggers (see the times
// noted below each slot) with the CRON_SECRET bearer.
export const runtime = 'nodejs';
export const maxDuration = 60;

import { jsonRes, errRes, HttpError } from '@/lib/auth';
import { sendToUser } from '@/lib/push';
import { q } from '@/lib/db';

// The app is India-first and monthKey()/startOfDay() are computed in the
// user's local time on the client. Servers run UTC, so shift by IST to keep
// "today" and "this month" meaning the same thing on both sides.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const rupees = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export async function POST(request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization') || '';
    if (!secret || auth !== `Bearer ${secret}`) throw new HttpError('Unauthorized', 401);

    const slot = new URL(request.url).searchParams.get('slot') || 'evening';
    if (!['morning', 'evening', 'late'].includes(slot)) throw new HttpError('slot must be morning, evening, or late');

    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    const monthKey = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, '0')}`;
    const dayStart = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST_OFFSET_MS;
    const tomorrowStart = dayStart + DAY_MS;
    const yesterdayStart = dayStart - DAY_MS;
    const monthStart = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1) - IST_OFFSET_MS;
    const monthEnd = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() + 1, 1) - IST_OFFSET_MS;
    const weekStart = dayStart - 7 * DAY_MS;

    const isSunday = nowIst.getUTCDay() === 0;
    const isMidMonth = nowIst.getUTCDate() === 15;

    const subs = await q(`SELECT DISTINCT p.user_id, u.notify_summary, u.notify_missed, u.notify_budget, u.notify_weekly, u.notify_midmonth
         FROM push_subscriptions p JOIN users u ON p.user_id = u.id`);

    let sent = 0;

    // ── morning: yesterday's recap ──────────────────────────────────────
    // 9:00 AM IST — the day is over, nothing new to nudge about yet, just
    // closes the loop before today starts.
    if (slot === 'morning') {
      const { rows } = await q(`SELECT user_id, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id`, [yesterdayStart, dayStart]);
      const ySpend = new Map(rows.map((r) => [r.user_id, Number(r.spent) || 0]));

      for (const u of subs.rows) {
        if (u.notify_summary === 0) continue;
        const amt = ySpend.get(u.user_id) || 0;
        if (amt <= 0) continue;
        sent += await sendToUser(u.user_id, {
          title: 'Yesterday',
          body: `You spent ${rupees(amt)} yesterday. Tap to review.`,
          tag: 'yesterday-recap',
          url: '/ledger',
        });
      }
      return jsonRes({ ok: true, slot, candidates: subs.rows.length, sent });
    }

    // ── evening & late share the same spend data ────────────────────────
    const [loggedToday, spendRows, budgetRows, todaySpendRows, weekSpendRows] = await Promise.all([
      q('SELECT DISTINCT user_id FROM transactions WHERE deleted = 0 AND created_at >= ?', [dayStart]),
      q(`SELECT user_id, category, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id, category`, [monthStart, monthEnd]),
      q('SELECT user_id, category, amount FROM budgets WHERE month = ?', [monthKey]),
      q(`SELECT user_id, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id`, [dayStart, tomorrowStart]),
      (slot === 'evening' && isSunday) ? q(`SELECT user_id, SUM(amount) AS spent FROM transactions
          WHERE type = 'expense' AND deleted = 0 AND occurred_at >= ? AND occurred_at < ?
          GROUP BY user_id`, [weekStart, dayStart]) : { rows: [] },
    ]);

    // Active = logged something at ANY point today, not just before this
    // run — so a user who logs between the evening and late runs correctly
    // gets no "late" nudge, without either slot needing to know about the other.
    const active = new Set(loggedToday.rows.map((r) => r.user_id));
    const todaySpend = new Map(todaySpendRows.rows.map((r) => [r.user_id, Number(r.spent) || 0]));
    const weekSpend = new Map(weekSpendRows.rows.map((r) => [r.user_id, Number(r.spent) || 0]));

    const spend = new Map(); // user_id -> { total, byCategory }
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

    for (const u of subs.rows) {
      const userId = u.user_id;
      const tSpend = todaySpend.get(userId) || 0;

      if (slot === 'evening') {
        // 8:30 PM IST — the main daily check-in: budget/weekly/mid-month
        // alerts, plus a summary if you've logged, or the first nudge if not.
        if (u.notify_budget !== 0) {
          const breach = overspend.get(userId);
          if (breach) {
            sent += await sendToUser(userId, {
              title: `Over budget: ${breach.label}`,
              body: `You're ${rupees(breach.over)} past your ${rupees(breach.budget)} budget this month.`,
              tag: 'budget-alert',
              url: '/budgets',
            });
          }
        }

        if (isMidMonth && u.notify_midmonth !== 0) {
          const s = spend.get(userId);
          if (s && s.total > 0) {
            sent += await sendToUser(userId, {
              title: 'Mid-Month Check',
              body: `Halfway through the month! You've spent ${rupees(s.total)} so far.`,
              tag: 'midmonth-check',
              url: '/insights',
            });
          }
        }

        if (isSunday && u.notify_weekly !== 0) {
          const wSpend = weekSpend.get(userId);
          if (wSpend && wSpend > 0) {
            sent += await sendToUser(userId, {
              title: 'Weekly Review',
              body: `You spent ${rupees(wSpend)} in the last 7 days. Tap to review.`,
              tag: 'weekly-review',
              url: '/insights',
            });
          }
        }

        if (tSpend > 0) {
          if (u.notify_summary !== 0) {
            sent += await sendToUser(userId, {
              title: 'Daily Summary',
              body: `You logged ${rupees(tSpend)} in expenses today.`,
              tag: 'daily-summary',
              url: '/ledger',
            });
          }
        } else if (u.notify_missed !== 0 && !active.has(userId)) {
          sent += await sendToUser(userId, {
            title: 'Log today’s expenses',
            body: 'Nothing recorded yet today. It takes a few seconds.',
            tag: 'daily-reminder',
            url: '/?action=add',
          });
        }
      } else {
        // late — 10:30 PM IST — quieter last call, and ONLY an escalation:
        // fires solely for someone who ignored the evening nudge and still
        // has nothing logged, never a repeat of anything already sent.
        if (tSpend === 0 && u.notify_missed !== 0 && !active.has(userId)) {
          sent += await sendToUser(userId, {
            title: 'Last call for today',
            body: 'Still nothing logged today — a few seconds before you turn in.',
            tag: 'daily-reminder-late',
            url: '/?action=add',
          });
        }
      }
    }

    return jsonRes({ ok: true, slot, candidates: subs.rows.length, sent });
  } catch (e) { return errRes(e); }
}

// Vercel Cron issues GET requests; same handler, same auth check.
export const GET = POST;
