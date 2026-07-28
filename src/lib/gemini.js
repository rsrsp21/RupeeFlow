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

const entrySchema = () => {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}.
Return ONLY a JSON object: {"transactions":[{"type":"expense|income|transfer","amount_rupees":number,"category":"one of: ${CATEGORIES.join(', ')}","note":"short description","project":"project/label name if mentioned, else empty string","date":"YYYY-MM-DD or null"}],"transcript":"what was said"}.
Rules: amounts are in Indian Rupees. "date" is when the expense happened: resolve ANY spoken date reference to an absolute YYYY-MM-DD — "yesterday", "last Friday", "on 26th July", "two days back", "26 tariq ko" all resolve relative to today (${today}); if the year isn't stated use the most recent past occurrence; if no date is mentioned use null (means today). Infer category from context (e.g. "chai" → Food & Dining, "Uber/auto/metro" → Transport, "recharge/electricity" → Bills & Utilities). If a project or client name is mentioned (e.g. "for the Sharma project"), put it in "project". Multiple expenses in one sentence become multiple transactions.`;
};

// Few-shot hint from the user's own note history, so a rephrased repeat of
// something they've logged before ("chicken 300g" → "chicken 300 grams")
// gets the same category/project instead of a fresh, possibly different guess.
function historyHint(history) {
  const items = (history || []).filter((h) => h && h.note && h.category).slice(0, 60);
  if (!items.length) return '';
  const list = items.map((h) => `"${h.note}" → ${h.category}${h.project ? ` (project: ${h.project})` : ''}`).join('; ');
  return `This user's own past entries and the category/project used for each — reuse the same category (and project) for the same kind of item even if the quantity, unit, or wording differs slightly, e.g. "chicken 300g" and "chicken 300 grams" are the same item: ${list}\n`;
}

export function parseText(text, projects = [], history = []) {
  return gemini([{
    text: `You convert casual Indian-English/Hinglish speech about money into ledger entries.
Known project labels: ${projects.join(', ') || '(none)'} — match against these when possible.
${historyHint(history)}${entrySchema()}\n\nSpeech: "${text}"`,
  }]);
}

export function parseVoice(audioB64, mimeType, projects = [], history = []) {
  return gemini([
    { text: `Transcribe this audio (Indian English / Hinglish about money), then convert it into ledger entries.
Known project labels: ${projects.join(', ') || '(none)'}.\n${historyHint(history)}${entrySchema()}` },
    { inlineData: { mimeType: mimeType || 'audio/webm', data: audioB64 } },
  ]);
}

// One-off AI category guess for the manual add/edit form — used when neither
// the regex rules nor the user's own note history already resolved one.
export function categorizeNote(note, history = []) {
  return gemini([{
    text: `Categorize this personal-finance note into exactly one category.
Categories: ${CATEGORIES.join(', ')}
${historyHint(history)}Note: "${note}"
Return ONLY JSON: {"category":"exact category name from the list above"}`,
  }], { temperature: 0.1 });
}

export function parseReceipt(imageB64, mimeType) {
  return gemini([
    { text: `Read this Indian receipt/bill photo. Return ONLY JSON:
{"merchant":"store name","total_rupees":number,"date":"YYYY-MM-DD or null","category":"one of: ${CATEGORIES.join(', ')}","items":[{"name":"item","price_rupees":number}],"confidence":"high|medium|low"}.
The total is the final payable amount (after GST/discounts). If unreadable, set total_rupees to 0 and confidence "low".` },
    { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageB64 } },
  ]);
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
