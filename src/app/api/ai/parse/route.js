// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { parseText } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { text, history, customCategories, holdings } = await request.json().catch(() => ({}));
    if (!text) throw new HttpError('Text required');
    return jsonRes(await parseText(text, history || [], customCategories || [], holdings || []));
  } catch (e) { return errRes(e); }
}
