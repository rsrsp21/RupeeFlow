// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { budgetSuggestions } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { summary } = await request.json().catch(() => ({}));
    if (!summary) throw new HttpError('Summary required');
    return jsonRes(await budgetSuggestions(summary));
  } catch (e) { return errRes(e); }
}
