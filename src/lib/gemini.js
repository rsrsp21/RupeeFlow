// All AI features via Google Gemini (free-tier friendly): one multimodal model
// for speech→entries, receipt OCR, weekly insights, and Q&A.
export const CATEGORIES = [
  'Food & Dining','Groceries','Transport','Fuel','Shopping','Bills & Utilities','Rent',
  'Health','Education','Entertainment','Travel','Subscriptions','Personal Care',
  'Gifts & Donations','Investments','Salary','Business','EMI & Loans','Insurance','Other',
];

async function gemini(parts, { asJson = true, temperature = 0.2 } = {}) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature, maxOutputTokens: 2048,
          ...(asJson ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!asJson) return text;
  return JSON.parse(text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim());
}

const entrySchema = () => {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}.
Return ONLY a JSON object: {"transactions":[{"type":"expense|income|transfer","amount_rupees":number,"category":"one of: ${CATEGORIES.join(', ')}","note":"short description","project":"project/label name if mentioned, else empty string","date":"YYYY-MM-DD or null"}],"transcript":"what was said"}.
Rules: amounts are in Indian Rupees. "date" is when the expense happened: resolve ANY spoken date reference to an absolute YYYY-MM-DD — "yesterday", "last Friday", "on 26th July", "two days back", "26 tariq ko" all resolve relative to today (${today}); if the year isn't stated use the most recent past occurrence; if no date is mentioned use null (means today). Infer category from context (e.g. "chai" → Food & Dining, "Uber/auto/metro" → Transport, "recharge/electricity" → Bills & Utilities). If a project or client name is mentioned (e.g. "for the Sharma project"), put it in "project". Multiple expenses in one sentence become multiple transactions.`;
};

export function parseText(text, projects = []) {
  return gemini([{
    text: `You convert casual Indian-English/Hinglish speech about money into ledger entries.
Known project labels: ${projects.join(', ') || '(none)'} — match against these when possible.
${entrySchema()}\n\nSpeech: "${text}"`,
  }]);
}

export function parseVoice(audioB64, mimeType, projects = []) {
  return gemini([
    { text: `Transcribe this audio (Indian English / Hinglish about money), then convert it into ledger entries.
Known project labels: ${projects.join(', ') || '(none)'}.\n${entrySchema()}` },
    { inlineData: { mimeType: mimeType || 'audio/webm', data: audioB64 } },
  ]);
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
Write a concise weekly insight: 1) biggest spending categories and week-over-week change, 2) anything unusual or likely unnecessary, 3) budget status, 4) ONE specific actionable tip. Max 130 words, plain text, no markdown headers, may use ₹ figures. Be specific to the data, never generic.`,
  }], { asJson: false, temperature: 0.6 });
}

export function askQuestion(question, summary) {
  return gemini([{
    text: `You are RupeeFlow's finance assistant. Answer using ONLY this user's data (amounts in ₹, JSON):
${JSON.stringify(summary || {})}
Question: "${question}"
Answer in under 100 words, specific numbers from the data, plain text. If the data can't answer it, say so briefly.`,
  }], { asJson: false, temperature: 0.4 });
}
