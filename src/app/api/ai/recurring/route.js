// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { detectRecurring } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { entries } = await request.json().catch(() => ({}));
    if (!Array.isArray(entries) || !entries.length) throw new HttpError('Entries required');
    // `entries` are already pre-grouped candidates from the client (see Insights.jsx) — cap
    // defensively in case a caller sends more than the ~40 the client ever produces.
    return jsonRes(await detectRecurring(entries.slice(0, 60)));
  } catch (e) { return errRes(e); }
}
