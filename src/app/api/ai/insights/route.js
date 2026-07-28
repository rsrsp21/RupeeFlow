import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { weeklyInsights } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { summary } = await request.json().catch(() => ({}));
    if (!summary) throw new HttpError('Summary required');
    return jsonRes({ insight: (await weeklyInsights(summary)).trim() });
  } catch (e) { return errRes(e); }
}
