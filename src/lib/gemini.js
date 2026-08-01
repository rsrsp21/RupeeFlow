// All AI features via Google Gemini (free-tier friendly): one multimodal model
// for speech→entries, receipt OCR, weekly insights, and Q&A.
export const CATEGORIES = [
  'Food & Dining','Groceries','Transport','Fuel','Shopping','Bills & Utilities','Rent',
  'Health','Education','Entertainment','Travel','Subscriptions','Personal Care',
  'Gifts & Donations','Investments','Salary','Business','EMI & Loans','Insurance','Other',
];

// No maxOutputTokens cap — let each response run as long as it needs to.
// Uncapped means the model's own ceiling applies instead (8192 for
// gemini-2.0-flash), so truncation only happens if a response is
// genuinely enormous, not because we clipped it short.
async function gemini(parts, { asJson = true, temperature = 0.2 } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured on the server');
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature,
          ...(asJson ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  // A non-STOP finish (safety block, recitation, truncation) means `text` is
  // empty or cut off — surface that plainly instead of a cryptic JSON error.
  if (!text) {
    throw new Error(`Gemini returned no content (${candidate?.finishReason || 'empty response'})`);
  }
  if (!asJson) return text;
  const cleaned = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was cut off (hit the token limit) — try again');
    }
    throw new Error(`Gemini returned malformed JSON: ${cleaned.slice(0, 200)}`);
  }
}

// Every category prompt offers the same choice: pick from what already
// exists (built-ins + this user's own custom ones) so we don't fragment
// their categories with near-duplicates, but invent a short new one when
// nothing genuinely fits rather than force a bad match into "Other".
function categoryChoices(extra = []) {
  const names = [...CATEGORIES, ...(extra || []).filter(Boolean)];
  return `Existing categories: ${names.join(', ')}.
If one of these genuinely fits, use it exactly as written. Only if truly none of them fit, invent a new short category name (Title Case, 1-3 words, e.g. "Pet Care") instead of forcing a bad match — do not use a new name if an existing one is close enough.`;
}

const entrySchema = (extra = []) => {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}.
Return ONLY a JSON object: {"transactions":[{"type":"expense|income|transfer","amount_rupees":number,"category":"a category name","note":"short description","date":"YYYY-MM-DD or null"}],"transcript":"what was said"}.
Rules: amounts are in Indian Rupees. "date" is when the expense happened: resolve ANY spoken date reference to an absolute YYYY-MM-DD — "yesterday", "last Friday", "on 26th July", "two days back", "26 tariq ko" all resolve relative to today (${today}); if the year isn't stated use the most recent past occurrence; if no date is mentioned use null (means today). ${categoryChoices(extra)} Multiple expenses in one sentence become multiple transactions.`;
};

// Few-shot hint from the user's own note history, so a rephrased repeat of
// something they've logged before ("chicken 300g" → "chicken 300 grams")
// gets the same category instead of a fresh, possibly different guess.
function historyHint(history) {
  const items = (history || []).filter((h) => h && h.note && h.category).slice(0, 60);
  if (!items.length) return '';
  const list = items.map((h) => `"${h.note}" → ${h.category}`).join('; ');
  return `This user's own past entries and the category used for each — reuse the same category for the same kind of item even if the quantity, unit, or wording differs slightly, e.g. "chicken 300g" and "chicken 300 grams" are the same item: ${list}\n`;
}

export function parseText(text, history = [], customCategories = []) {
  return gemini([{
    text: `You convert casual Indian-English/Hinglish speech about money into ledger entries.
${historyHint(history)}${entrySchema(customCategories)}\n\nSpeech: "${text}"`,
  }]);
}

export function parseVoice(audioB64, mimeType, history = [], customCategories = []) {
  return gemini([
    { text: `Transcribe this audio (Indian English / Hinglish about money), then convert it into ledger entries.
${historyHint(history)}${entrySchema(customCategories)}` },
    { inlineData: { mimeType: mimeType || 'audio/webm', data: audioB64 } },
  ]);
}

// One-off AI category guess for the manual add/edit form — used when neither
// the regex rules nor the user's own note history already resolved one.
export function categorizeNote(note, history = [], customCategories = []) {
  return gemini([{
    text: `Categorize this personal-finance note into exactly one category.
${categoryChoices(customCategories)}
${historyHint(history)}Note: "${note}"
Return ONLY JSON: {"category":"the category name"}`,
  }], { temperature: 0.1 });
}

export function parseReceipt(imageB64, mimeType, history = [], customCategories = []) {
  return gemini([
    { text: `Read this Indian receipt/bill photo. Return ONLY JSON:
{"merchant":"store name","total_rupees":number,"date":"YYYY-MM-DD or null","category":"a category name","items":[{"name":"item","price_rupees":number}],"confidence":"high|medium|low"}.
The total is the final payable amount (after GST/discounts). If unreadable, set total_rupees to 0 and confidence "low".
${categoryChoices(customCategories)}
${historyHint(history)}`.trim() },
    { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageB64 } },
  ]);
}

// Generates a small line-icon (in the style of the built-in category icons)
// for a user-created custom category. The SVG is untrusted output from here
// on — route.js sanitizes it (sanitizeSvg) before it's ever stored, and the
// client sanitizes again before rendering.
export function categoryIcon(name) {
  return gemini([{
    text: `Design a small line icon for the personal-finance category "${name}", matching the exact visual style of Lucide icons (the set already used everywhere else in this app) — freehand SVG coordinates from a language model tend to come out lopsided or overly ambitious, so lean on the examples below rather than improvising a complex shape.

Study how few shapes these use and how coarse/restrained the coordinates are — copy that restraint, not any specific shape:
- Heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
- Home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
- Tag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.29-7.29a1 1 0 0 0 0-1.41L12 2Z"/><circle cx="7" cy="7" r="1"/></svg>
- Gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>

Return ONLY JSON: {"svg":"...","color":"#rrggbb"}
Requirements:
- Root element exactly: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"> ... </svg>
- Prefer circle, rect, and straight-line paths over intricate freeform curves — if you're not confident you can draw a shape cleanly, pick a simpler one instead (a labeled tag, a simple bag/box outline, a basic symbol) rather than attempting something detailed.
- Only these child elements: path, circle, rect, line, ellipse, polygon, polyline, g. Only these attributes: d, cx, cy, r, rx, ry, x, y, x1, y1, x2, y2, width, height, points, fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, fill-rule, clip-rule.
- No script, style, image, foreignObject, href, or xlink:href, no event attributes, no external references, no comments, no text nodes.
- 1 to 4 shapes total, coordinates comfortably inside the 0-24 viewBox (roughly 2-22) with breathing room like the examples — never edge-to-edge.
color is a single hex color that suits the category (used as a themed background tint, not necessarily the icon's own stroke color).`,
  }], { temperature: 0.35 });
}

export function weeklyInsights(summary) {
  return gemini([{
    text: `You are a sharp, friendly personal-finance coach for a busy Indian professional. All amounts in ₹.
Weekly data (JSON): ${JSON.stringify(summary)}
Write a concise weekly insight covering: biggest spending categories and week-over-week change, anything unusual or likely unnecessary, budget status, and ONE specific actionable tip. Max 130 words. Format with lightweight markdown — **bold** the key ₹ figures and category names, use a short bullet list ("- ") if you're covering multiple points. No headers (#). Be specific to the data, never generic.`,
  }], { asJson: false, temperature: 0.6 });
}

// Structured multi-card coaching: savings ideas, risks, wins, forecast note.
export function coachCards(summary) {
  return gemini([{
    text: `You are a precise personal-finance analyst for an Indian professional. All amounts in ₹.
Data (JSON): ${JSON.stringify(summary)}

Return ONLY JSON: {"headline":"one-line verdict on this month, max 12 words","score":0-100,"score_reason":"max 12 words","cards":[{"kind":"save|risk|win|watch","title":"max 7 words","detail":"max 24 words, cite a real ₹ figure from the data","impact_rupees":number_or_null}]}
Give 3–5 cards. "save" = a concrete cut with rupee impact; "risk" = overspending or budget danger; "win" = something genuinely good; "watch" = a trend to monitor. Be specific to the numbers — never generic advice. score = financial health this month (higher is better).`,
  }], { temperature: 0.45 });
}

// Suggest monthly budgets per category from actual history.
export function budgetSuggestions(summary) {
  return gemini([{
    text: `You set realistic monthly budgets for an Indian professional. All amounts in ₹.
Spending history (JSON): ${JSON.stringify(summary)}

Return ONLY JSON: {"overall_rupees":number,"reasoning":"max 20 words","categories":[{"category":"exact category name from the data","suggested_rupees":number,"current_avg_rupees":number,"rationale":"max 12 words"}]}
Suggest budgets for the 5–7 categories they actually spend on. Base them on real averages: trim discretionary categories ~10-15%, keep essentials (Rent, Bills & Utilities, Health, EMI & Loans) at actual levels. Round to sensible numbers (nearest 100 or 500). overall_rupees should be achievable, not punitive.`,
  }], { temperature: 0.3 });
}

export function askQuestion(question, summary) {
  return gemini([{
    text: `You are RupeeFlow's finance assistant. Answer using ONLY this user's data (amounts in ₹, JSON):
${JSON.stringify(summary || {})}
Question: "${question}"
Answer in under 100 words with specific numbers from the data. **Bold** key ₹ figures, and use a short bullet list ("- ") if listing more than two items. If the data can't answer it, say so briefly.`,
  }], { asJson: false, temperature: 0.4 });
}
