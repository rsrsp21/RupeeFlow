<div align="center">

# RupeeFlow ₹

**Money, minus the effort.**

A minimalist, offline-first budget & expense tracker built for busy professionals — speak or scan an expense, get AI categorization and weekly insights, and stay in sync across every device.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?logo=googlegemini&logoColor=white)](https://ai.google.dev)
[![Cloudflare D1](https://img.shields.io/badge/DB-Cloudflare%20D1-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Folder structure](#folder-structure)
- [Setup: Cloudflare D1](#setup-cloudflare-d1-one-time-3-minutes)
- [Run locally](#run-locally)
- [Deploy](#deploy)
- [Why it works on serverless](#why-it-works-on-serverless-vercel)
- [How sync stays correct](#how-sync-stays-correct)
- [Costs](#costs)
- [License](#license)

## Features

**Capture, fast**
- **Speak an expense** — "450 lunch with client, 120 auto to office" becomes two correctly categorized ledger entries in one shot (Gemini transcribes + parses; understands Hinglish).
- **Scan a receipt** — photo → merchant, total (post-GST/discounts), date, and category auto-filled; you just confirm.
- **Quick add by text** — type a sentence instead of a form.
- **Note-history autofill** — typing a note surfaces matching past entries (quantity/units ignored, so "chicken 300g" and "chicken 300 grams" match) and fills category, account, and amount from what you picked last time.
- **AI auto-categorize** — instant keyword rules as you type, with a one-tap AI fallback for anything new, primed with your own categorization history so it stays consistent.

**Understand your money**
- **Financial health score + coaching cards** — wins, risks, and concrete savings ideas, cited against your real numbers.
- **Weekly AI review** — grounded in your actual data; plus ask anything in plain English ("where do I spend more?", "what's unnecessary?").
- **Dashboard** — KPI strip, 7-day trend, category breakdown, budget pace, and auto-computed insight cards.
- **Push notifications** — a daily nudge if you haven't logged anything, and budget-overspend alerts, sent via a scheduled cron job.

**Budgets & bulletproof math**
- **Budgets with carry-forward** — per-category or overall, editable and deletable any time; unused budget rolls into next month.
- **AI budget suggestions** — one tap, built from your real spending history.
- Every amount is stored as **integer paise**; balances are always recomputed from the ledger, so adding/editing/deleting any entry mid-history can never corrupt totals.
- Transfers between accounts (Cash/Bank/UPI/Credit Card/Savings) are first-class entries, not a workaround.

**Cross-device sync, offline-first**
- Offline outbox + incremental pull with last-write-wins merge; auto-syncs every few seconds, on focus, and on reconnect.
- Installable PWA (Add to Home Screen), works fully offline via IndexedDB.
- A view crash shows a recoverable inline error instead of taking down the whole app.

**Search, filter, export**
- Free-text + type/category/account/amount/date filters, works offline.
- Export CSV, a formatted PDF report, or a raw JSON backup — any preset range or a custom from/to date, with real dates (not "this month") printed in the document and filename so it still makes sense whenever you open it later.

**Minimalist UI**
- Dark mode (default) + light, ₹-first tabular numerals, spring animations, donut & trend charts.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js](https://nextjs.org) (App Router) — frontend + API routes in one deploy |
| UI | React 19, [Framer Motion](https://www.framer.com/motion/), [Lucide](https://lucide.dev) icons, hand-written CSS (no UI kit) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) over its HTTP API — no driver, works from any host |
| AI | [Google Gemini](https://ai.google.dev) (free tier) — speech/text parsing, receipt OCR, insights, categorization |
| Auth | Stateless HS256 JWTs, PBKDF2 password hashing — both via Web Crypto, zero auth dependencies |
| Offline | IndexedDB outbox + incremental last-write-wins sync |
| Push | Web Push (VAPID) via `web-push`, sent from a scheduled cron route |
| Hosting | [Vercel](https://vercel.com) or [Render](https://render.com) — genuinely serverless, no persistent connections anywhere |

## Folder structure

```
├── src/
│   ├── app/
│   │   ├── layout.jsx            # root layout, theme bootstrap
│   │   ├── page.jsx               # mounts the client app
│   │   ├── globals.css            # design system (dark/light tokens)
│   │   └── api/                   # backend (route handlers)
│   │       ├── auth/{register,login,profile}/route.js
│   │       ├── tx/route.js               # search/filter
│   │       ├── tx/{push,pull}/route.js   # offline sync (LWW)
│   │       ├── budgets/route.js          # GET/PUT/DELETE
│   │       ├── export/csv/route.js
│   │       ├── push/{key,subscribe}/route.js
│   │       ├── cron/notify/route.js      # daily reminder + budget alerts
│   │       └── ai/{voice,parse,receipt,categorize,insights,coach,budget-suggest,ask}/route.js
│   ├── lib/
│   │   ├── db.js                  # Cloudflare D1 HTTP client + auto schema creation
│   │   ├── auth.js                # PBKDF2 + JWT (Web Crypto, no deps)
│   │   ├── transactions.js        # ledger ops, LWW sync, CSV
│   │   ├── gemini.js              # all AI prompts/calls
│   │   ├── push.js                # web-push sender
│   │   ├── noteMatch.js           # note normalization + history matching (shared client/server)
│   │   └── client/                # browser-side
│   │       ├── store.jsx          # React context: state + sync engine
│   │       ├── idb.js             # IndexedDB (cache + offline outbox)
│   │       ├── exporters.js       # CSV/PDF/JSON export engine
│   │       ├── pushClient.js       # push subscription helpers
│   │       └── constants.js       # categories, ₹ money utils
│   └── components/
│       ├── App.jsx  Nav.jsx  ErrorBoundary.jsx  TxItem.jsx
│       ├── views/    Dashboard · Ledger · Budgets · Insights · Settings
│       ├── modals/   TxModal · VoiceModal · PromptModal · BudgetModal · ExportModal
│       └── charts/   Donut · TrendBars · CategoryBars
└── public/                        # PWA: manifest, sw.js, icons
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
npm run dev              # http://localhost:3000
```

Push notifications and the daily reminder cron are optional — leave their env vars blank to skip that setup (see `.env.example` for what each one does).

## Deploy

### Vercel

1. Push the repo to GitHub, import it in Vercel.
2. Add env vars: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`, `JWT_SECRET`, `GEMINI_API_KEY` ([free key](https://aistudio.google.com/apikey)), `GEMINI_MODEL` (optional, default `gemini-2.0-flash`).
3. For push notifications, also add `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`), `VAPID_SUBJECT`, and `CRON_SECRET`. `vercel.json` already schedules the daily notify job — nothing else to configure.
4. Deploy. Done.

### Render

1. New → Web Service → connect the repo. Build: `npm install && npm run build`. Start: `npm start`.
2. Add the same env vars as above.
3. Render has no built-in cron — point any external scheduler (e.g. [cron-job.org](https://cron-job.org)) at `POST /api/cron/notify` once a day with header `Authorization: Bearer <CRON_SECRET>` if you want the daily reminder/budget alerts.
4. Deploy.

Open the URL on your phone → "Add to Home Screen" for the full app experience.

## Why it works on serverless (Vercel)

Serverless normally breaks database apps because each invocation is a fresh, short-lived instance — traditional Postgres connection pools get exhausted. RupeeFlow avoids that entirely:

- **No persistent connections.** D1 is reached over its HTTP API with `fetch`, so there's no pool to exhaust and nothing to keep warm.
- **Stateless auth.** Sessions are HS256 JWTs verified from the secret, so any instance can serve any request with no shared memory or session store.
- **Lazy schema.** Tables are created only if a query reports them missing, so cold starts don't pay an extra round-trip.
- **Generous timeouts where they're needed.** Every AI route and the transaction sync routes set `maxDuration = 60` — Vercel's default is 10s, which Gemini vision/audio calls (and syncing a large offline backlog) can exceed.

Verified with an empty database: cold start auto-creates tables, warm paths add no extra calls, and concurrent writes all apply cleanly.

## How sync stays correct

Every entry has a client-generated UUID, `updated_at`, and `rev`. Offline edits queue in an IndexedDB outbox; on reconnect they push in a batch and the server applies **last-write-wins** per entry. Deletes are soft (`deleted=1`) so they propagate to all devices instead of resurrecting. Devices pull incrementally using an `updated_at` cursor and poll every few seconds while the tab is visible (plus on focus/reconnect), so changes appear on your other devices within seconds. Balances are never stored — always derived — so no edit can ever corrupt history.

## Costs

Vercel Hobby / Render free tier + Cloudflare D1 free tier (5 GB, 5M reads/day) + Gemini free tier = ₹0/month for typical personal use.

## License

[MIT](LICENSE) — use it, fork it, ship your own version.
