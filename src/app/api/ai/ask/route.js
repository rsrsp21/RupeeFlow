// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { askQuestion } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { question, summary } = await request.json().catch(() => ({}));
    if (!question) throw new HttpError('Question required');
    return jsonRes({ answer: (await askQuestion(question, summary)).trim() });
  } catch (e) { return errRes(e); }
}
