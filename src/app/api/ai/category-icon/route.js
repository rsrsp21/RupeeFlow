// Gemini calls can exceed Vercel's 10s default — raise the ceiling.
export const maxDuration = 60;

import { requireUser, jsonRes, errRes, HttpError } from '@/lib/auth';
import { categoryIcon } from '@/lib/gemini';
import { putCategory } from '@/lib/transactions';
import { sanitizeSvg } from '@/lib/svgSanitize';

// Generates the icon AND persists the category in one call — a custom
// category is only ever meaningful with an icon attached, so there's no
// value in a separate "create category" step that could succeed while the
// icon generation half fails (or vice versa).
export async function POST(request) {
  try {
    const userId = await requireUser(request);
    if (!userId) throw new HttpError('Unauthorized', 401);
    const { name } = await request.json().catch(() => ({}));
    if (!name || !name.trim()) throw new HttpError('Category name required');

    const out = await categoryIcon(name.trim());
    const svg = sanitizeSvg(out?.svg);
    const color = /^#[0-9a-fA-F]{3,8}$/.test(out?.color || '') ? out.color : '#9ca3af';
    // A rejected/malformed SVG still lets the category get created — it just
    // renders with the generic fallback icon instead of a custom one.
    const saved = await putCategory(userId, { name: name.trim(), icon_svg: svg || '', color });
    return jsonRes(saved);
  } catch (e) { return errRes(e); }
}
