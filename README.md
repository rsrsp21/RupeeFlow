<div align="center">

<img src="public/icon.svg" width="72" height="72" alt="RupeeFlow logo" />

# RupeeFlow

**Effortless money tracking.**

A minimalist, offline-first budget and expense tracker built for busy professionals. Speak or scan an expense, get AI categorization and weekly insights, and stay in sync across every device.

**[Live demo → rupeeflowindia.vercel.app](https://rupeeflowindia.vercel.app)**

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
- [Why it works on serverless](#why-it-works-on-serverless-vercel)
- [How sync stays correct](#how-sync-stays-correct)
- [License](#license)

## Features

**Capture, fast**
- **Speak an expense**: "450 lunch with client, 120 auto to office" becomes two correctly categorized ledger entries in one shot (Gemini transcribes and parses; understands Hinglish).
- **Scan a receipt**: a photo fills in merchant, total (post-GST/discounts), date, and category; you just confirm.
- **Quick add by text**: type a sentence instead of a form.
- **Note-history autofill**: typing a note surfaces matching past entries (quantity and units are ignored, so "chicken 300g" and "chicken 300 grams" match) and fills category, account, and amount from what you picked last time.
- **AI auto-categorize**: instant keyword rules as you type, with a one-tap AI fallback for anything new, primed with your own categorization history so it stays consistent.

**Understand your money**
- **Financial health score and coaching cards**, citing wins, risks, and concrete savings ideas against your real numbers.
- **Weekly AI review** grounded in your actual data, plus ask anything in plain English ("where do I spend more?", "what's unnecessary?").
- **Dashboard**: KPI strip, 7-day trend, category breakdown, budget pace, and auto-computed insight cards.
- **Push notifications**: a daily nudge if you haven't logged anything, plus budget-overspend alerts, sent via a scheduled cron job.

**Budgets and bulletproof math**
- **Budgets with carry-forward**, per-category or overall, editable and deletable any time; unused budget rolls into next month.
- **AI budget suggestions**, built from your real spending history in one tap.
- Every amount is stored as **integer paise**. Balances are always recomputed from the ledger, so adding, editing, or deleting any entry mid-history can never corrupt totals.
- Transfers between accounts (Cash/Bank/UPI/Credit Card/Savings) are first-class entries, not a workaround.

**Cross-device sync, offline-first**
- Offline outbox plus incremental pull with last-write-wins merge; auto-syncs every few seconds, on focus, and on reconnect.
- Installable PWA (Add to Home Screen), works fully offline via IndexedDB.
- A view crash shows a recoverable inline error instead of taking down the whole app.

**Search, filter, export**
- Free-text plus type/category/account/amount/date filters, works offline.
- Export CSV, a formatted PDF report, or a raw JSON backup, for any preset range or a custom from/to date. Real dates (not "this month") are printed in the document and filename so it still makes sense whenever you open it later.

**Minimalist UI**
- Dark mode (default) and light, tabular numerals, spring animations, donut and trend charts.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js](https://nextjs.org) (App Router); frontend and API routes in one deploy |
| UI | React 19, [Framer Motion](https://www.framer.com/motion/), [Lucide](https://lucide.dev) icons, hand-written CSS (no UI kit) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) over its HTTP API, no driver needed, works from any host |
| AI | [Google Gemini](https://ai.google.dev) (free tier) for speech/text parsing, receipt OCR, insights, and categorization |
| Auth | Stateless HS256 JWTs and PBKDF2 password hashing, both via Web Crypto, zero auth dependencies |
| Offline | IndexedDB outbox with incremental last-write-wins sync |
| Push | Web Push (VAPID) via `web-push`, sent from a scheduled cron route |
| Hosting | [Vercel](https://vercel.com) or [Render](https://render.com), genuinely serverless, no persistent connections anywhere |

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
│   │       └── constants.js       # categories, money utils
│   └── components/
│       ├── App.jsx  Nav.jsx  ErrorBoundary.jsx  TxItem.jsx
│       ├── views/    Dashboard · Ledger · Budgets · Insights · Settings
│       ├── modals/   TxModal · VoiceModal · PromptModal · BudgetModal · ExportModal
│       └── charts/   Donut · TrendBars · CategoryBars
└── public/                        # PWA: manifest, sw.js, icons
```

## Setup: Cloudflare D1 (one time, ~3 minutes)

1. **Create the database**: Cloudflare dashboard → Storage & Databases → D1 → Create, or run:
   ```bash
   npx wrangler d1 create rupeeflow-db
   ```
   Note the **database id**.
2. **Get your account id**, shown in the dashboard's right sidebar on any page.
3. **Create an API token**: My Profile → API Tokens → Create Token → Custom token with permission **Account · D1 · Edit**.

Tables auto-create on the app's first request, so there's no migration step.

## Run locally

```bash
npm install
cp .env.example .env    # fill in the CLOUDFLARE_* vars, JWT_SECRET, GEMINI_API_KEY
npm run dev              # http://localhost:3000
```

Push notifications and the daily reminder cron are optional. Leave their env vars blank to skip that setup (see `.env.example` for what each one does).

## Why it works on serverless (Vercel)

Serverless normally breaks database apps because each invocation is a fresh, short-lived instance, so traditional Postgres connection pools get exhausted. RupeeFlow avoids that entirely:

- **No persistent connections.** D1 is reached over its HTTP API with `fetch`, so there's no pool to exhaust and nothing to keep warm.
- **Stateless auth.** Sessions are HS256 JWTs verified from the secret, so any instance can serve any request with no shared memory or session store.
- **Lazy schema.** Tables are created only if a query reports them missing, so cold starts don't pay an extra round-trip.
- **Generous timeouts where they're needed.** Every AI route and the transaction sync routes set `maxDuration = 60`, since Vercel's default is 10s, which Gemini vision/audio calls (and syncing a large offline backlog) can exceed.

Verified with an empty database: cold start auto-creates tables, warm paths add no extra calls, and concurrent writes all apply cleanly.

## How sync stays correct

Every entry has a client-generated UUID, `updated_at`, and `rev`. Offline edits queue in an IndexedDB outbox; on reconnect they push in a batch and the server applies **last-write-wins** per entry. Deletes are soft (`deleted=1`) so they propagate to all devices instead of resurrecting. Devices pull incrementally using an `updated_at` cursor and poll every few seconds while the tab is visible (plus on focus/reconnect), so changes appear on your other devices within seconds. Balances are never stored; they're always derived, so no edit can ever corrupt history.

## License

[MIT](LICENSE). Use it, fork it, ship your own version.
