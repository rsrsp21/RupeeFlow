# RupeeFlow ₹

**Money, minus the effort.** A minimalist, offline-first budget & expenditure tracker for busy professionals — voice entry, AI receipt scanning, weekly AI insights, and seamless sync across devices.

Single **Next.js** app (frontend + API routes together) with **Cloudflare D1** as the database (via its HTTP API — works from any host), deployable to **Vercel** or **Render** in minutes. AI powered by **Google Gemini** (free tier).

## Features

- **Speak an expense** — "450 lunch with client for Acme project, 120 auto to office" becomes two correctly categorized ledger entries (Gemini transcribes + parses in one shot; understands Hinglish).
- **Scan a receipt** — photo → merchant, total (post-GST), date, category auto-filled; you just confirm.
- **Auto-categorization** — instant keyword rules as you type, AI for voice/receipts, project labels matched from your history.
- **Weekly AI insights** — grounded in your actual numbers; plus ask anything: "where do I spend more?", "what's unnecessary?"
- **Bulletproof math** — every amount is stored as integer paise; balances are always recomputed from the ledger, so adding/editing/deleting any entry mid-history can never corrupt totals.
- **Cross-device sync** — offline-first outbox + incremental pull with last-write-wins merge; auto-syncs every few seconds, on focus, and on reconnect.
- **Budgets with carry-forward** — per-category or overall; unused budget rolls into next month. Easy transfers between accounts (Cash/Bank/UPI/Credit Card/Savings).
- **Search & filter** — free-text + type/category/project/date-range, works offline.
- **Export** — one-tap CSV and a formatted PDF monthly report.
- **Minimalist UI** — dark mode (default) + light, ₹-first tabular numerals, spring animations, donut & trend charts, installable PWA.

## Folder structure

```
├── src/
│   ├── app/
│   │   ├── layout.jsx            # root layout, theme bootstrap
│   │   ├── page.jsx              # mounts the client app
│   │   ├── globals.css           # design system (dark/light tokens)
│   │   └── api/                  # backend (route handlers)
│   │       ├── auth/{register,login}/route.js
│   │       ├── tx/route.js       # search/filter
│   │       ├── tx/{push,pull}/route.js   # offline sync (LWW)
│   │       ├── budgets/route.js
│   │       ├── export/csv/route.js
│   │       └── ai/{voice,parse,receipt,insights,ask}/route.js
│   ├── lib/
│   │   ├── db.js                 # Cloudflare D1 HTTP client + auto schema creation
│   │   ├── auth.js               # PBKDF2 + JWT (Web Crypto, no deps)
│   │   ├── transactions.js       # ledger ops, LWW sync, CSV
│   │   ├── gemini.js             # all AI prompts/calls
│   │   └── client/               # browser-side
│   │       ├── store.jsx         # React context: state + sync engine
│   │       ├── idb.js            # IndexedDB (cache + offline outbox)
│   │       └── constants.js      # categories, ₹ money utils
│   └── components/
│       ├── App.jsx  Nav.jsx  AuthView.jsx  TxItem.jsx
│       ├── views/   Dashboard · Ledger · Budgets · Insights · Settings
│       ├── modals/  TxModal · VoiceModal · BudgetModal
│       └── charts/  Donut · Bars
└── public/                       # PWA: manifest, sw.js, icon
```

## Setup: Cloudflare D1 (one time, ~3 minutes)

1. **Create the database** — Cloudflare dashboard → Storage & Databases → D1 → Create, or:
   ```bash
   npx wrangler d1 create rupeeflow-db
   ```
   Note the **database id**.
2. **Get your account id** — shown in the dashboard's right sidebar on any page.
3. **Create an API token** — My Profile → API Tokens → Create Token → Custom token with permission **Account · D1 · Edit**.

Tables auto-create on the app's first request — no migration step.

## Run locally

```bash
npm install
cp .env.example .env    # fill in the CLOUDFLARE_* vars, JWT_SECRET, GEMINI_API_KEY
npm run dev             # http://localhost:3000
```

## Deploy

### Vercel

1. Push the repo to GitHub, import it in Vercel.
2. Add env vars: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`, `JWT_SECRET`, `GEMINI_API_KEY` ([free key](https://aistudio.google.com/apikey)), `GEMINI_MODEL` (optional, default `gemini-2.0-flash`).
3. Deploy. Done.

### Render

1. New → Web Service → connect the repo. Build: `npm install && npm run build`. Start: `npm start`.
2. Add the same env vars as above.
3. Deploy.

Open the URL on your phone → "Add to Home Screen" for the app experience.

## Why it works on serverless (Vercel)

Serverless normally breaks database apps because each invocation is a fresh, short-lived instance — traditional Postgres connection pools get exhausted. RupeeFlow avoids that entirely:

- **No persistent connections.** D1 is reached over its HTTP API with `fetch`, so there's no pool to exhaust and nothing to keep warm.
- **Stateless auth.** Sessions are HS256 JWTs verified from the secret, so any instance can serve any request with no shared memory or session store.
- **Lazy schema.** Tables are created only if a query reports them missing, so cold starts don't pay an extra round-trip.
- **AI routes set `maxDuration = 60`.** Vercel's default is 10s, which Gemini vision/audio calls can exceed — without this, receipt scans would 504.

Verified with an empty database: cold start auto-creates tables, warm paths add no extra calls, and 12 concurrent writes all apply cleanly.

## How sync stays correct

Every entry has a client-generated UUID, `updated_at`, and `rev`. Offline edits queue in an IndexedDB outbox; on reconnect they push in a batch and the server applies **last-write-wins** per entry. Deletes are soft (`deleted=1`) so they propagate to all devices instead of resurrecting. Devices pull incrementally using an `updated_at` cursor and poll every few seconds while the tab is visible (plus on focus/reconnect), so changes appear on your other devices within seconds. Balances are never stored — always derived — so no edit can ever corrupt history.

## Costs

Vercel Hobby / Render free tier + Cloudflare D1 free tier (5 GB, 5M reads/day) + Gemini free tier = ₹0/month for typical personal use.
