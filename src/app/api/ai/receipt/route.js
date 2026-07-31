// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { parseReceipt } from '@/lib/gemini';

export async function POST(request) {
  try {
    if (!(await requireUser(request))) throw new HttpError('Unauthorized', 401);
    const { image, mimeType, history, customCategories } = await request.json().catch(() => ({}));
    if (!image) throw new HttpError('Image required');
    return jsonRes(await parseReceipt(image, mimeType, history || [], customCategories || []));
  } catch (e) { return errRes(e); }
}
