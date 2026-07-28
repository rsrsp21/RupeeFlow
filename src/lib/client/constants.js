export const TAGLINE = 'Effortless money tracking';

export const CATEGORIES = {
  'Food & Dining':    { ico: '🍽️', color: '#f59e0b' },
  'Groceries':        { ico: '🛒', color: '#84cc16' },
  'Transport':        { ico: '🛺', color: '#38bdf8' },
  'Fuel':             { ico: '⛽', color: '#fb923c' },
  'Shopping':         { ico: '🛍️', color: '#e879f9' },
  'Bills & Utilities':{ ico: '💡', color: '#facc15' },
  'Rent':             { ico: '🏠', color: '#a78bfa' },
  'Health':           { ico: '💊', color: '#f87171' },
  'Education':        { ico: '📚', color: '#60a5fa' },
  'Entertainment':    { ico: '🎬', color: '#f472b6' },
  'Travel':           { ico: '✈️', color: '#2dd4bf' },
  'Subscriptions':    { ico: '🔁', color: '#c084fc' },
  'Personal Care':    { ico: '💇', color: '#fda4af' },
  'Gifts & Donations':{ ico: '🎁', color: '#fbbf24' },
  'Investments':      { ico: '📈', color: '#34d399' },
  'Salary':           { ico: '💼', color: '#4ade80' },
  'Business':         { ico: '🏢', color: '#94a3b8' },
  'EMI & Loans':      { ico: '🏦', color: '#fb7185' },
  'Insurance':        { ico: '🛡️', color: '#7dd3fc' },
  'Other':            { ico: '📌', color: '#9ca3af' },
};

export const ACCOUNTS = ['Cash', 'Bank', 'UPI', 'Credit Card', 'Savings'];

export const AUTO_RULES = [
  [/\b(lunch|dinner|breakfast|chai|coffee|tea|swiggy|zomato|restaurant|biryani|pizza|snack|tiffin|dosa|canteen)\b/i, 'Food & Dining'],
  [/\b(grocery|groceries|bigbasket|blinkit|zepto|dmart|vegetables|sabzi|kirana|milk)\b/i, 'Groceries'],
  [/\b(uber|ola|auto|rickshaw|metro|bus|train|cab|taxi|rapido)\b/i, 'Transport'],
  [/\b(petrol|diesel|fuel|cng)\b/i, 'Fuel'],
  [/\b(amazon|flipkart|myntra|ajio|clothes|shoes|shopping)\b/i, 'Shopping'],
  [/\b(electricity|water bill|recharge|wifi|broadband|jio|airtel|vi|gas|bill)\b/i, 'Bills & Utilities'],
  [/\b(rent|landlord)\b/i, 'Rent'],
  [/\b(doctor|medicine|pharmacy|hospital|apollo|clinic|medical)\b/i, 'Health'],
  [/\b(course|udemy|book|tuition|fees|exam)\b/i, 'Education'],
  [/\b(movie|netflix|hotstar|prime|concert|game|bookmyshow)\b/i, 'Entertainment'],
  [/\b(flight|hotel|trip|irctc|makemytrip|goibibo|travel)\b/i, 'Travel'],
  [/\b(subscription|spotify|membership)\b/i, 'Subscriptions'],
  [/\b(salon|haircut|spa|gym)\b/i, 'Personal Care'],
  [/\b(gift|donation|charity|temple)\b/i, 'Gifts & Donations'],
  [/\b(sip|mutual fund|stocks|zerodha|groww|fd|investment)\b/i, 'Investments'],
  [/\b(salary|stipend|payout|invoice paid)\b/i, 'Salary'],
  [/\b(emi|loan)\b/i, 'EMI & Loans'],
  [/\b(insurance|lic|premium)\b/i, 'Insurance'],
];

// ── money (exact: integer paise everywhere) ──
const fmtINR = typeof Intl !== 'undefined'
  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : null;
const fmtINRp = typeof Intl !== 'undefined'
  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }) : null;

export const rupees = (paise) =>
  paise % 100 === 0 ? fmtINR.format(paise / 100) : fmtINRp.format(paise / 100);

// Short form for tight spaces (chart labels) — ₹450, ₹1.2k, ₹3.4L.
export const rupeesShort = (paise) => {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
};

export const toPaise = (str) => {
  const n = parseFloat(String(str).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
