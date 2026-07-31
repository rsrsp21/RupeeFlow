// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { categorizeNote } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { note, history, customCategories } = await request.json().catch(() => ({}));
    if (!note || !note.trim()) throw new HttpError('Note required');
    return jsonRes(await categorizeNote(note, history || [], customCategories || []));
  } catch (e) { return errRes(e); }
}
