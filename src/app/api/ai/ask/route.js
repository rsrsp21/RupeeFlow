// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { askQuestion, writeSqlForQuestion, answerFromRows } from '@/lib/gemini';
import { validateSql, buildScopedSql, SQL_SCHEMA_NOTE } from '@/lib/askSql';
import { q } from '@/lib/db';

// Questions about individual purchases ("what did chicken cost in August")
// can't be answered from the pre-aggregated summary — it only carries category
// totals — so the assistant used to decline them despite the entries existing.
// Those go through a generated query instead; balances/net-worth questions
// still come from the summary, which already holds them.
//
// Every failure path here falls back to the summary answer rather than
// surfacing an error: a slightly vaguer answer beats "something went wrong".
async function sqlBackedAnswer(userId, question, summary) {
  let plan;
  try {
    plan = await writeSqlForQuestion(question, SQL_SCHEMA_NOTE);
  } catch { return null; }
  if (!plan?.need_sql || !plan.sql) return null;

  const check = validateSql(plan.sql);
  // A rejected query is never repaired and re-run — if the model wrote
  // something outside the grammar, fall back rather than negotiate with it.
  if (!check.ok) return null;

  let rows;
  try {
    ({ rows } = await q(buildScopedSql(check.sql), [userId]));
  } catch { return null; }
  if (!Array.isArray(rows)) return null;

  return (await answerFromRows(question, rows, summary)).trim();
}

export async function POST(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { question, summary } = await request.json().catch(() => ({}));
    if (!question) throw new HttpError('Question required');

    const viaSql = await sqlBackedAnswer(userId, question, summary);
    if (viaSql) return jsonRes({ answer: viaSql });

    return jsonRes({ answer: (await askQuestion(question, summary)).trim() });
  } catch (e) { return errRes(e); }
}
