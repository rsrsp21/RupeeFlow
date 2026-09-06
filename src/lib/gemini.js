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

const entrySchema = (extra = [], holdings = [], accounts = [], groups = [], clientToday = '') => {
  // The caller's local date wins. Falling back to the server's UTC date is
  // only for a client that didn't send one — for a user in IST that fallback
  // is a day behind for the first five and a half hours of every day.
  const today = /^\d{4}-\d{2}-\d{2}$/.test(clientToday)
    ? clientToday : new Date().toISOString().slice(0, 10);
  const holdingList = (holdings || []).filter(Boolean);
  const accountList = (accounts || []).filter(Boolean);
  const groupList = (groups || []).filter(Boolean);
  return `Today's date is ${today}.
Return ONLY a JSON object: {"transactions":[{"type":"expense|income|invest","amount_rupees":number,"category":"a category name","note":"short description","date":"YYYY-MM-DD or null","destination":"holding name or null","account":"account name or null","group":"group/trip/event name or null"}],"transcript":"what was said"}.
Rules: amounts are in Indian Rupees. "date" is when the expense happened: resolve ANY spoken date reference to an absolute YYYY-MM-DD — "yesterday", "last Friday", "on 26th July", "two days back", "26 tariq ko" all resolve relative to today (${today}); if the year isn't stated use the most recent past occurrence. If the speech does NOT mention any date at all, "date" MUST be null — do not fill in today's date, do not guess. Only ever return a date string when the speech actually referred to a time. This matters: the app supplies its own date for undated entries, and a date you invented would silently override it. ${categoryChoices(extra)} Multiple expenses in one sentence become multiple transactions.
Use type "invest" ONLY when money is being put into savings or an investment rather than spent — SIPs, mutual funds, stocks, fixed deposits, gold, recurring deposits, PPF, or money explicitly set aside/saved (e.g. "put 5000 into my SIP", "invested 10k in stocks", "moved 2000 to savings"). Investing is not an expense. For type "invest", set "destination" to the holding it went into.${holdingList.length ? ` The user's existing holdings are: ${holdingList.join(', ')} — reuse one of these names exactly when it fits, and only name a new one if none do.` : ' The user has no holdings set up yet, so name the destination sensibly (e.g. "Mutual Funds", "Stocks", "FD").'} For every other type set "destination" to null.
The user's existing accounts are: ${accountList.length ? accountList.join(', ') : 'None'}. If the user mentions an account for an expense or income (e.g., "paid with HDFC", "from SBI"), set "account" to the closest matching account name. If none is mentioned, set it to null.
A "group" ties several entries to one trip or event (e.g. "for the Goa trip", "wedding shopping", "office offsite") — set it ONLY when the speech names or clearly implies such an event, never invent one for an ordinary standalone expense.${groupList.length ? ` The user's existing groups are: ${groupList.join(', ')} — reuse one of these exactly when it fits, and only propose a new short name if genuinely none do.` : ''} Otherwise set "group" to null.`;
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

// Decides whether a chat message is a question about the user's money or an
// instruction to record something. The assistant can do both, so this has to
// be settled before anything else happens — answering "I spent 300 on chicken"
// with an analysis, or recording "what did I spend on chicken" as an expense,
// are both bad failures.
export function classifyChatIntent(message) {
  return gemini([{
    text: `Decide what this message to a personal-finance assistant wants.
Message: "${message}"
Return ONLY JSON: {"intent":"add"|"ask"}.
"add" = the user is telling you about money they spent, received, or moved, so it should be recorded. Past or present statements of fact: "spent 300 on chicken", "paid 2000 rent from HDFC", "got my salary", "put 5000 in my SIP".
"ask" = the user wants to know something about money already recorded: "what did I spend on chicken", "how much last month", "am I over budget", "show me my biggest expense".
A question is always "ask", even if it names an amount. When genuinely unclear, choose "ask" -- answering a question that was meant as an entry is a small annoyance, but silently recording something the user only asked about is a wrong number in their ledger.`,
  }], { asJson: true, temperature: 0 });
}

// Writes the assistant's side of a recording conversation: either the one
// question needed to fill a gap, or the confirmation once an entry is saved.
export function entryReply(kind, entry, missing, accounts = []) {
  const detail = JSON.stringify(entry || {});
  const prompt = kind === 'confirm'
    ? `You are a finance assistant that has just recorded an entry for the user. Entry (JSON): ${detail}
Confirm it in ONE short sentence, stating what was recorded, the amount, the account and the date in plain words (e.g. "Added ₹300 for chicken on HDFC, dated 5 September"). **Bold** the amount, and group its digits the Indian way (₹1,50,000 not ₹150,000). Do not ask a follow-up question, do not mention JSON or fields.`
    : `You are a finance assistant recording an entry for the user. So far (JSON): ${detail}
You still need: ${missing.join(' and ')}.${missing.includes('account') && accounts.length ? ` The user's accounts are: ${accounts.join(', ')}.` : ''}
Ask for ONLY the missing detail, in one short friendly sentence, repeating back what you already understood so they know it landed (e.g. "Got ₹300 for chicken — which account was that from?"). Group rupee digits the Indian way (₹1,50,000 not ₹150,000). If you need the account and the user has accounts listed, name a few as options. Never ask about anything already present above. No JSON, no lists.`;
  return gemini([{ text: prompt }], { asJson: false, temperature: 0.3 });
}

export function parseText(text, history = [], customCategories = [], holdings = [], accounts = [], groups = [], today = '') {
  return gemini([{
    text: `You convert casual Indian-English/Hinglish speech about money into ledger entries.
${historyHint(history)}${entrySchema(customCategories, holdings, accounts, groups, today)}\n\nSpeech: "${text}"`,
  }]);
}

export function parseVoice(audioB64, mimeType, history = [], customCategories = [], holdings = [], accounts = [], groups = [], today = '') {
  return gemini([
    { text: `Transcribe this audio (Indian English / Hinglish about money), then convert it into ledger entries.
${historyHint(history)}${entrySchema(customCategories, holdings, accounts, groups, today)}` },
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

export function parseReceipt(imageB64, mimeType, history = [], customCategories = [], accounts = []) {
  const accountList = (accounts || []).filter(Boolean);
  return gemini([
    { text: `Read this Indian receipt/bill photo. Return ONLY JSON:
{"merchant":"store name","total_rupees":number,"date":"YYYY-MM-DD or null","category":"a category name","items":[{"name":"item","price_rupees":number}],"confidence":"high|medium|low","account":"account name or null"}.
The total is the final payable amount (after GST/discounts). If unreadable, set total_rupees to 0 and confidence "low".
${categoryChoices(customCategories)}
If the receipt shows a payment method (e.g., card ending in 1234, UPI, bank name) and it matches one of the user's accounts (${accountList.length ? accountList.join(', ') : 'None'}), set "account" to it. Otherwise set to null.
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

// The summary now carries a balance sheet, not just a spend list. Spelling
// out what the unfamiliar fields mean is cheaper than hoping the model infers
// them, and it stops the classic mistake of reading a transfer into savings
// as money spent.
const DATA_NOTES = `Write every rupee figure the Indian way, since this is an Indian app and Western grouping reads as wrong to the user: group digits as 1,50,000 not 150,000 — last three digits, then pairs (12,34,567). Use lakh and crore for large round figures where it reads naturally ("₹1.5 lakh", "₹2 crore"). Always prefix with ₹, never "Rs" or "INR", and never write a bare unformatted number like 150000.
Reading the data: all amounts are rupees. "net_worth_rupees" splits into spendable (cash in accounts), invested (savings/investment holdings), owed_to_you (money the user fronted for someone else and expects back — a real asset, but NOT cash they can spend until it is repaid, so never suggest spending it or count it as available) and card_dues (credit card debt, a liability). total = spendable + invested + owed_to_you - card_dues. Money moved into a holding is NOT spending — it leaves the spendable balance but stays the user's money, so never call investing an expense or a loss. "savings_rate_pct" is the share of the last 30 days' income that went into holdings, measured over that same trailing window on BOTH sides. "recurring_commitments" are notes seen across two or more months, so treat those as fixed obligations rather than things to casually cut. A holding's "valued_days_ago" is how stale its stated value is — if it is null the user has never valued it, and above about 30 days say the figure may be out of date instead of quoting it as current fact. "utilisation_pct" on a credit card is how much of its limit is used. Pay usually arrives at the END of a month, so "month_income_rupees" being 0 in the first days of a new month does NOT mean the user has no income — check "income_last_30d_rupees" and "last_income" before saying anything about earnings, and never tell them they earned nothing when last_income shows a recent credit. "savings_rate_pct" is measured against that trailing 30-day income for the same reason. The same trap applies to saving: money is usually moved to savings the day pay arrives, so a salary on the 31st is typically saved on the 31st too. In the first days of a month "month_invested_rupees" can therefore be 0 while the user has in fact just saved — check "invested_last_30d_rupees" before commenting on saving, and NEVER tell them they have saved nothing this month when that figure is positive. Say "you saved ₹X since your last payday" rather than pinning it to a calendar month. "groups" are user-defined labels tying several entries across different categories/accounts to one event or trip (e.g. "Goa Trip", "Wedding") — their total_rupees is the LIFETIME total for that label across the user's whole history, not scoped to this data window, so it's the right figure whenever the user asks what something "cost in total" or "cost altogether". "items" is per-item spending taken from the notes on the user's own entries, deduped so quantity phrasing ("chicken 1kg", "chicken 500g") counts as one item: "total_rupees" is that item's total over the covered window and "by_month_rupees" splits it by calendar month (YYYY-MM). Use it to answer questions about a specific thing the user bought, including for a named month — read that month's key out of by_month_rupees rather than saying item-level detail is unavailable. It holds the top items only, so if an item the user names is absent say you have no entry for it, not that it cost nothing. "covers_from"/"covers_to" bound the window these item and category figures cover — if a question falls outside it, say the window doesn't reach that far instead of answering 0.`;

export function weeklyInsights(summary) {
  return gemini([{
    text: `You are a sharp, friendly personal-finance coach for a busy Indian professional. All amounts in ₹.
Weekly data (JSON): ${JSON.stringify(summary)}
${DATA_NOTES}
Write a concise weekly insight. Lead with the user's overall position, not just spending: what came in, what went out, what was invested, and which way net worth moved — e.g. "spent ₹10,500 but invested ₹20,000, so you're ₹9,500 ahead". Then cover the biggest spending categories and the week-over-week change, anything unusual or likely unnecessary, budget status, and ONE specific actionable tip. If savings_rate_pct is present, say whether it's strong or thin for their income. Max 140 words. Lightweight markdown — **bold** the key ₹ figures and category names, a short bullet list ("- ") if covering multiple points. No headers (#). Always specific to the data, never generic.`,
  }], { asJson: false, temperature: 0.6 });
}

// Structured multi-card coaching: savings ideas, risks, wins, forecast note.
export function coachCards(summary) {
  return gemini([{
    text: `You are a precise personal-finance analyst for an Indian professional. All amounts in ₹.
Data (JSON): ${JSON.stringify(summary)}

${DATA_NOTES}

Return ONLY JSON: {"headline":"one-line verdict on this month, max 12 words","score":0-100,"score_reason":"max 12 words","cards":[{"kind":"save|risk|win|watch|debt","title":"max 7 words","detail":"max 24 words, cite a real ₹ figure from the data","impact_rupees":number_or_null}]}
Give 3–5 cards. "save" = a concrete cut with rupee impact; "risk" = overspending or budget danger; "win" = something genuinely good; "watch" = a trend to monitor; "debt" = credit card dues or high utilisation that needs clearing. Raise a "debt" card whenever card_dues are meaningful or any card is above 30% utilisation. Recognise a strong savings_rate_pct as a "win" rather than hunting for something negative.
score = overall financial health, weighing FOUR things, not just overspending: (1) savings rate — investing a healthy share of income should lift the score substantially, (2) card dues and utilisation — outstanding debt should pull it down, (3) spending against budgets, (4) whether net worth is growing. Someone who overspends slightly but invests 30% of income is healthier than someone who spends little and saves nothing; score accordingly.
Judge saving on "invested_last_30d_rupees" and "savings_rate_pct", NEVER on "month_invested_rupees" alone. Pay lands at the end of a month and is usually saved the same day, so in the first days of a new month the calendar figure is 0 while the user has in fact just saved — scoring that as "saved nothing" is simply wrong, and it is the most common way this score comes out too low. The same applies to income: check "income_last_30d_rupees" and "last_income" before treating a month as having no earnings.
State in score_reason what actually drove the number, so a low score is explainable rather than mysterious. Be specific to the numbers — never generic advice.`,
  }], { temperature: 0.45 });
}

// Suggest monthly budgets per category from actual history.
export function budgetSuggestions(summary, history) {
  return gemini([{
    text: `You set realistic monthly budgets for an Indian professional. All amounts in ₹.
Spending history (JSON): ${JSON.stringify(summary)}
${history?.length ? `Per-category month-by-month history (JSON): ${JSON.stringify(history)}` : ''}
${DATA_NOTES}

Return ONLY JSON: {"overall_rupees":number,"reasoning":"max 20 words","categories":[{"category":"exact category name from the data","suggested_rupees":number,"current_avg_rupees":number,"rationale":"max 12 words"}]}
Suggest budgets for the 5–7 categories they actually spend on.${history?.length ? `
Base every figure on that per-category history, which holds whole past months only:
- "median_rupees" is the anchor, NOT the mean — one festival or repair month must not permanently raise a budget.
- "every_month": true marks a fixed commitment (rent, subscriptions, EMI). Budget it AT its actual cost and never trim it.
- "volatility" says how much a category swings. For "low", the median is a safe budget. For "high", budget nearer "p80_rupees" — a median cap on a category that regularly doubles will be breached most months and the user will stop trusting the budgets.
- "months_active" against "months_tracked" shows how often it occurs at all. Something seen in 1 of 6 months is occasional, not monthly; leave it out rather than inventing a monthly line for it.
- Set "current_avg_rupees" to that category's median_rupees, so the user sees what the suggestion was measured against.` : `
Base them on real averages.`}
Trim discretionary categories ~10-15%, keep essentials (Rent, Bills & Utilities, Health, EMI & Loans) at actual levels. Treat anything in recurring_commitments, and the amount already going into holdings each month, as FIXED — budget around them rather than trimming them, and never propose cutting an investment contribution to hit a spending target. Round to sensible numbers (nearest 100 or 500). overall_rupees is a cap on SPENDING only, so exclude money invested; it should be achievable, not punitive.
A budget the user breaches every month is worse than none — prefer achievable over aspirational, and say briefly in each rationale what the figure is based on.`,
  }], { temperature: 0.3 });
}

// Step one of the two-step ask: turn the question into a SQL query, or decline.
// Kept separate from answering so the query can be validated and run before
// any prose is written — the model never gets to narrate over rows it didn't
// actually receive.
export function writeSqlForQuestion(question, schemaNote, categoryList = '') {
  return gemini([{
    text: `You translate a personal-finance question into ONE SQLite SELECT query.
${schemaNote}
Question: "${question}"
Return ONLY JSON: {"sql":"SELECT ...","need_sql":true} — or {"need_sql":false} if the question is about balances, net worth, holdings, budgets or savings rate, which live outside this table and are already summarised elsewhere.
Rules: a single SELECT only; no semicolons, comments, CTEs or other statements. Never reference user_id or any table other than tx. Add ORDER BY and a small LIMIT when listing. For a named month with no year, use the most recent occurrence of that month in the data.
Getting the MATCH right is the part most often got wrong, and it matters for every kind of question, not just one.
A bare word is a SUBSTRING, so LIKE '%word%' silently catches longer, different things: '%chicken%' also matches "chicken biryani", '%uber%' also matches "uber eats", '%book%' also matches "bookshelf" and "booking fee", '%gym%' also matches "gym bag". Counting those together produces a confident, wrong total.
So before writing the query, decide what the user actually meant:
1. A specific phrase ("chicken breast", "uber eats") -> match that phrase and nothing else.
2. A plain thing ("chicken", "uber", "coffee") -> they mean that thing itself, NOT everything whose text happens to contain the word. Narrow it.
3. Explicitly broad ("everything with X in it", "all X spending", "anything related to X") -> the plain LIKE is what they asked for.
For case 2, narrow with the CATEGORY rather than a list of banned words. Each entry already carries the user's own category, and that separates kinds of spending far more reliably than the note text: a raw ingredient sits under a grocery category while a prepared dish sits under an eating-out one; a taxi ride and a food delivery from the same brand differ by category, not by name. A word blocklist cannot work -- "butter chicken" and "chicken 65" name dishes without containing any generic dish word, and you cannot enumerate every case -- so do not build one. The categories in use are: ${categoryList}. Pick from these; never invent a category name.
When a word is genuinely ambiguous and the category does not settle it, prefer the narrower reading and say what you assumed.
Always ALSO return the matched notes, never a bare total: GROUP BY note with SUM(rupees) and COUNT(*), ordered by total descending. A single number hides a wrong match; a per-note breakdown lets the user see what was counted and correct it. Aggregate rather than dumping raw rows.`,
  }], { asJson: true, temperature: 0.1 });
}

// Step two: answer from the rows the query actually returned.
export function answerFromRows(question, rows, summary) {
  return gemini([{
    text: `You are RupeeFlow's finance assistant. All amounts in ₹.
The user asked: "${question}"
This query result is the authoritative answer to it (JSON rows): ${JSON.stringify(rows)}
Wider context if useful: ${JSON.stringify(summary || {})}
Format every rupee figure the Indian way: 1,50,000 not 150,000 (last three digits, then pairs), prefixed with ₹, using lakh/crore for large round numbers where natural.
Answer the question directly from the rows. When the rows are a per-item breakdown, give the total AND list what it is made of, so the user can see what was counted and correct you if an entry does not belong. If something ambiguous was included or excluded (a dish containing the ingredient, say), say so in a few words rather than silently folding it in. If the rows are empty, say there are no matching entries — do NOT say the data cannot answer it, and never report an empty result as ₹0 spent. Under 100 words, specific numbers, **bold** key ₹ figures, short "- " bullets if listing more than two items. Do not mention SQL, queries, databases or how the answer was computed.`,
  }], { asJson: false, temperature: 0.3 });
}

export function askQuestion(question, summary) {
  return gemini([{
    text: `You are RupeeFlow's finance assistant. Answer using ONLY this user's data (amounts in ₹, JSON):
${JSON.stringify(summary || {})}
${DATA_NOTES}
Question: "${question}"
You can answer questions about balances, net worth, individual accounts, credit card dues, investment holdings and their gains, savings rate, spending, named groups/trips/events (their lifetime totals, in "groups"), and what specific items cost — including within a named month, via "items" and its by_month_rupees breakdown — all of that is in the data above, so use it rather than saying you cannot. Answer in under 100 words with specific numbers. **Bold** key ₹ figures, and use a short bullet list ("- ") if listing more than two items. If a holding's value is stale (valued_days_ago is large or null), say so rather than presenting it as current. Only if the data genuinely doesn't contain the answer, say so briefly.`,
  }], { asJson: false, temperature: 0.4 });
}
