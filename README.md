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
- [Cloudflare D1 Setup](#cloudflare-d1-setup)
- [Run locally](#run-locally)
- [Why it works on serverless](#why-it-works-on-serverless)
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
- **The AI sees the whole balance sheet**, not just spending: net worth, per-account balances, card utilisation, holdings with gains, savings rate, and recurring commitments. So it can answer "how much do I have?" and score financial health on savings and debt rather than overspending alone.
- **Pay-cycle aware.** Income is measured over a trailing 30 days, so a salary landing on the last working day isn't read as "no income this month".
- **Financial health score and coaching cards**, citing wins, risks, debt, and concrete savings ideas against your real numbers.
- **Weekly AI review** grounded in your actual data, plus ask anything in plain English ("where do I spend more?", "what's unnecessary?").
- **Where you stand**, computed locally with no API call: spendable, invested, card dues, savings rate, and runway — how many days your balance covers at your recent burn rate.
- **Dashboard**: KPI strip, net worth, 7-day and 6-month trends, this-month vs last-month breakdowns, budget pace, and auto-computed insight cards.
- **Push notifications**: a daily nudge if you haven't logged anything, plus budget-overspend alerts, sent via a scheduled cron job.

**Savings, investments, and a real balance sheet**
- **Holdings are not accounts.** Mutual funds, stocks, FDs, or cash kept at home live in their own list, so an FD never looks like money you can spend. Funding one is recorded as a transfer out of a real account: it leaves your spendable balance without ever counting as spending.
- **Market value, tracked honestly.** Each holding carries what it's worth and when you last said so, kept separate from cost basis, so gains and losses show as `value − contributed` and selling for more than you put in doesn't make the profit vanish. Stale valuations are flagged rather than quoted as fact.
- **Credit cards are liabilities.** A card's balance is what you owe, its limit is stored separately and never counted as money, and net worth reads as spendable + invested − card dues.

**Budgets and bulletproof math**
- **Budgets with carry-forward**, per-category or overall, editable and deletable any time; unused budget rolls into next month.
- **AI budget suggestions**, built from your real spending history in one tap, treating recurring commitments and investment contributions as fixed rather than things to trim.
- Every amount is stored as **integer paise**. Balances are always recomputed from the ledger, so adding, editing, or deleting any entry mid-history can never corrupt totals.
- Transfers between accounts (Cash/Bank/UPI/Credit Card/Other) are first-class entries, not a workaround.
- **Renaming an account, holding, or category rewrites every entry that referenced it**, so nothing is ever left pointing at a name that no longer exists.

**Cross-device sync, offline-first**
- Offline outbox plus incremental pull with last-write-wins merge; your own edits sync instantly, plus a periodic background pull (to pick up changes from another device) and immediate sync on focus/reconnect.
- Installable PWA (Add to Home Screen), works fully offline via IndexedDB.
- A view crash shows a recoverable inline error instead of taking down the whole app.

**Search, filter, export**
- Free-text plus type/category/account/amount/date filters, works offline.
- Search spans your whole history rather than the period tab you happen to be on, because that's what a search box is for.
- Export CSV (a spreadsheet-ready ledger), a formatted PDF report, or a JSON backup, for any preset range or a custom from/to date. Real dates (not "this month") are printed in the document and filename so it still makes sense whenever you open it later.
- The PDF carries your **position**, not just the ledger — spendable, invested, card dues, net worth and a per-holding value/contributed/gain table — and reports transfers separately, since money moved into savings is neither income nor spending. The JSON backup includes accounts, holdings, budgets and categories, so balances can actually be rebuilt from it.

**Minimalist UI**
- Dark mode (default) and light, tabular numerals, spring animations, donut and trend charts.
- Every screen is a real route, so browser back and Android's swipe-back walk the screens you visited instead of closing the app, and back dismisses an open sheet before leaving the screen.

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
│   │   ├── (app)/                 # one shared shell, one route per screen
│   │   │   ├── layout.jsx         # store + nav + FAB + modals + auth gate
│   │   │   └── {page,ledger,money,budgets,insights,settings}/…
│   │   ├── globals.css            # design system (dark/light tokens)
│   │   └── api/                   # backend (route handlers)
│   │       ├── auth/{register,login,profile}/route.js
│   │       ├── tx/route.js               # search/filter
│   │       ├── tx/{push,pull}/route.js   # offline sync (LWW)
│   │       ├── accounts/route.js         # accounts + opening balances/limits
│   │       ├── holdings/route.js         # savings & investments
│   │       ├── categories/route.js       # custom categories
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
│       ├── views/    Dashboard · Ledger · Money · Budgets · Insights · Settings
│       ├── money/    AccountsPanel · SavingsPanel
│       ├── modals/   TxModal · VoiceModal · PromptModal · BudgetModal · ExportModal
│       │             AccountModal · HoldingModal · AddAccountModal · ConfirmModal
│       └── charts/   Donut · TrendBars · CategoryBars
└── public/                        # PWA: manifest, sw.js, icons
```

## Cloudflare D1 Setup

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

## Why it works on serverless

Serverless normally breaks database apps because each invocation is a fresh, short-lived instance, so traditional Postgres connection pools get exhausted. RupeeFlow avoids that entirely:

- **No persistent connections.** D1 is reached over its HTTP API with `fetch`, so there's no pool to exhaust and nothing to keep warm.
- **Stateless auth.** Sessions are HS256 JWTs verified from the secret, so any instance can serve any request with no shared memory or session store.
- **Lazy schema.** Tables are created only if a query reports them missing, so cold starts don't pay an extra round-trip.
- **Generous timeouts where they're needed.** Every AI route and the transaction sync routes set `maxDuration = 60`, since Vercel's default is 10s, which Gemini vision/audio calls (and syncing a large offline backlog) can exceed.

Verified with an empty database: cold start auto-creates tables, warm paths add no extra calls, and concurrent writes all apply cleanly.

## How sync stays correct

Every entry has a client-generated UUID, `updated_at`, and `rev`. Offline edits queue in an IndexedDB outbox; on reconnect they push in a batch and the server applies **last-write-wins** per entry. Deletes are soft (`deleted=1`) so they propagate to all devices instead of resurrecting. Devices pull incrementally using an `updated_at` cursor. Your own edits sync right away; a longer background poll while the tab is visible (plus immediate sync on focus/reconnect) catches edits made on another device without polling the serverless functions every few seconds for every open tab. Balances are never stored; they're always derived, so no edit can ever corrupt history.

Two details matter more than they look:

- **The client mirrors the server's LWW rule exactly** (`updated_at`, then `rev` as the tiebreak). A looser comparison let a same-millisecond server row overwrite a newer local one — which, for a just-deleted entry, pulled the pre-delete version straight back in.
- **Each pull rewinds its cursor by a day.** `updated_at` comes from the *writing device's* clock, so with two devices even slightly out of step, a write timestamped below the cursor would be skipped permanently and no amount of polling would recover it. Re-fetching a day of rows is cheap, and the merge makes re-applying a no-op.

## License

[MIT](LICENSE). Use it, fork it, ship your own version.
