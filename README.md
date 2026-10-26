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
- **Speak an expense**: "450 lunch with client, 120 auto to office" becomes two correctly categorized ledger entries in one shot (Gemini transcribes and parses; understands Hinglish). Dates and accounts you mention are honoured, so "yesterday, 300 from HDFC" lands on yesterday in HDFC rather than today in your default account.
- **Scan a receipt**: a photo fills in merchant, total (post-GST/discounts), date, and category; you just confirm.
- **Quick add by text**: type a sentence instead of a form. Voice and text both understand withdrawals, transfers and transfer categories, not just spending.
- **Share straight into the app**: share a receipt image from your gallery or another app to RupeeFlow (PWA share target) and it opens ready to scan.
- **Home-screen shortcuts and a widget**: long-press the installed app for Add / Speak / Scan / Ledger, and on Windows add a "Spent today" widget with quick add.
- **Note-history autofill**: typing a note surfaces matching past entries (quantity and units are ignored, so "chicken 300g" and "chicken 300 grams" match), reuses your past wording, and fills category, account, and amount from what you picked last time.
- **AI auto-categorize**: instant keyword rules as you type, with a one-tap AI fallback for anything new, primed with your own categorization history so it stays consistent.
- **Custom categories with AI icons**: name a new category and Gemini draws a matching icon for it (sanitised SVG).
- **Groups for trips and events**: tag entries with a group like "Goa Trip"; groups are matched case-insensitively so the same trip never splits in two.
- **Indian number formatting** everywhere: amounts group as ₹1,23,456 as you type and in every figure.

**Insights, in three tabs**
- **Overview, Breakdown, Coach**: one Insights screen, with the period selector pinned above the tabs because it scopes all of them.
- **Analyse any period**: a single month, a quarter, a half-year or a full year, not just "this month".
- **Computed locally, no API call**: month-over-month change, category shares and deltas, month-end projection, weekday patterns, price drift on things you buy often, recurring bills that haven't shown up yet, outliers, a 6-month trend, per-account spending and credit-card health (utilisation, dues). All of it lives in `src/lib/analytics.mjs` and works offline.
- **Every category's spend and share**, alongside the money that only moved; tap a category to open its own entries in the Ledger.
- **Where you stand**: spendable, invested, card dues, savings rate, and runway — how many days your balance covers at your recent burn rate.
- **Financial health score and coaching cards** (save / risk / win / watch / debt), citing your real numbers. The AI sees the whole balance sheet — net worth, per-account balances, card utilisation, holdings with gains, savings rate, recurring commitments — and income is measured over a trailing 30 days so a month-end salary isn't read as "no income this month".
- **Weekly AI review** grounded in your actual data.

**Ask, the assistant**
- A chat sheet reachable from every Insights tab, with **voice both ways**: speak your question, and have any answer read aloud.
- **Answers questions about anything in your ledger**, not only what was pre-aggregated: "what did chicken cost in August?", "which shop do I spend most at on weekends?". The model writes a read-only SQL query that is checked against a strict allowlist and run against a single-user subquery, so it can't see anyone else's rows or change anything (`src/lib/askSql.js`). Item questions match the item itself, not every dish that merely contains the word.
- **Records entries from the chat**: "add 200 for coffee" becomes a ledger entry, and the assistant asks only for what's missing (date, account) instead of guessing.

**Savings, investments, and a real balance sheet**
- **Holdings are not accounts.** Mutual funds, stocks, FDs, or cash kept at home live in their own list, so an FD never looks like money you can spend. Funding one is recorded as a transfer out of a real account: it leaves your spendable balance without ever counting as spending.
- **Withdraw from a holding** right in the entry form. A partial withdrawal takes out the right share of cost basis, and a later valuation can't resurrect money already withdrawn.
- **Market value, tracked honestly.** Each holding carries what it's worth and when you last said so, kept separate from cost basis, so gains and losses show as `value − contributed` and selling for more than you put in doesn't make the profit vanish. Stale valuations are flagged rather than quoted as fact.
- **Credit cards are liabilities.** A card's balance is what you owe, its limit is stored separately and never counted as money, and net worth reads as spendable + invested − card dues.
- **IOU accounts** track money you've fronted for others: it counts as owed to you, not as cash you can spend, and lending is reported separately from ordinary transfers.
- Accounts can be **reordered**, one marked **primary**, and each account **reconciled** from its edit sheet.

**Budgets and bulletproof math**
- **Budgets with carry-forward**, per-category or overall, editable and deletable any time; unused budget rolls into next month.
- **AI budget suggestions** built from your real month-by-month history (not one blended total), treating recurring commitments and investment contributions as fixed rather than things to trim.
- Every amount is stored as **integer paise**. Balances are always recomputed from the ledger, so adding, editing, or deleting any entry mid-history can never corrupt totals.
- Transfers between accounts (Cash/Bank/UPI/Credit Card/IOU/Other) are first-class entries, not a workaround, and can carry their own category (kept behind a button so a spending category never leaks onto a transfer).
- **Uncategorised is a real state**, stored as an empty category rather than `Other`, so "show me what still needs a category" works and a deliberate "Other" stays distinct.
- **Renaming an account, holding, or category rewrites every entry that referenced it**, so nothing is ever left pointing at a name that no longer exists.

**Cross-device sync, offline-first**
- Offline outbox plus incremental pull with last-write-wins merge; your own edits sync instantly, plus a periodic background pull (to pick up changes from another device) and immediate sync on focus/reconnect.
- Installable PWA with an install banner until it's actually installed; works fully offline via IndexedDB.
- A view crash shows a recoverable inline error instead of taking down the whole app.

**Search, filter, export**
- **Ledger filters match the export's**: free text, type (expense / income / transfer / invest / withdraw / lending), category (including uncategorised), account, group, amount and date — and every filter takes several values at once. Works offline.
- Each day shows the balance as of that day alongside the current balance.
- Search spans your whole history rather than the period tab you happen to be on, because that's what a search box is for.
- **Export builder**: CSV (a spreadsheet-ready ledger), a formatted PDF report, or a JSON backup, for any preset range or a custom from/to date, narrowed to any mix of accounts, types, categories or groups, with your choice of columns. Real dates (not "this month") are printed in the document and filename so it still makes sense whenever you open it later.
- The PDF carries your **position**, not just the ledger — spendable, invested, card dues, net worth and a per-holding value/contributed/gain table — and its summary splits **spending** from **money moved** (transfers, investments, lending), since money moved into savings is neither income nor spending. The JSON backup includes accounts, holdings, budgets and categories, so balances can actually be rebuilt from it.
- **Reconcile against your bank.** Enter what the account actually shows and the gap is recorded as a dated adjustment entry, instead of editing the opening balance until the total looks right — which silently rewrites every past day's running total and makes figures agree by construction rather than because each entry is correct.
- **Restore from a JSON backup** — a merge, not a wipe: entries keep their original ids and timestamps, so the same last-write-wins rules apply and anything edited or deleted since the backup stays that way. Accounts, holdings and categories union by name, so restoring can't overwrite your current setup.

**Notifications**
- Four daily push slots, each saying something different: a **morning** recap of yesterday, an **afternoon** check-in with a bit of personality (today so far vs your own average), an **evening** summary with budget alerts (plus a weekly review on Sundays and a mid-month check), and a **late** nudge only if nothing has been logged since the evening one.
- One toggle in Settings, and a gentle prompt after login to turn them on. Tapping a notification deep-links to the right screen.

**Minimalist UI**
- Dark mode (default) and light, tabular numerals, spring animations, donut and trend charts. The design system is written up in [design.md](design.md).
- Every screen is a real route, so browser back and Android's swipe-back walk the screens you visited instead of closing the app, and back dismisses an open sheet before leaving the screen.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js](https://nextjs.org) 15 (App Router); frontend and API routes in one deploy |
| UI | React 19, [Framer Motion](https://www.framer.com/motion/), [Lucide](https://lucide.dev) icons, hand-written CSS (no UI kit) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) over its HTTP API, no driver needed, works from any host |
| AI | [Google Gemini](https://ai.google.dev) (free tier) for speech/text parsing, receipt OCR, insights, coaching, the Ask assistant, and category icons |
| Auth | Stateless HS256 JWTs and PBKDF2 password hashing, both via Web Crypto, zero auth dependencies |
| Offline | IndexedDB outbox with incremental last-write-wins sync |
| Push | Web Push (VAPID) via `web-push`, sent from a cron route hit by an external scheduler |
| Hosting | [Vercel](https://vercel.com) or [Render](https://render.com), genuinely serverless, no persistent connections anywhere |

## Folder structure

```
├── src/
│   ├── app/
│   │   ├── layout.jsx             # root layout, theme bootstrap
│   │   ├── (app)/                 # one shared shell, one route per screen
│   │   │   ├── layout.jsx         # store + nav + FAB + modals + auth gate
│   │   │   └── {page,ledger,money,budgets,insights,settings}/…
│   │   ├── share-target/route.js  # fallback for the PWA share target (the SW handles it first)
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
│   │       ├── settings/notifications/route.js
│   │       ├── cron/notify/route.js      # ?slot=morning|afternoon|evening|late
│   │       ├── widget/today/route.js     # data for the "Spent today" widget
│   │       ├── health/route.js
│   │       └── ai/{voice,parse,receipt,categorize,category-icon,insights,coach,
│   │              budget-suggest,ask,chat-entry}/route.js
│   ├── lib/
│   │   ├── db.js                  # Cloudflare D1 HTTP client + auto schema creation
│   │   ├── auth.js                # PBKDF2 + JWT (Web Crypto, no deps)
│   │   ├── passwordRules.js
│   │   ├── transactions.js        # ledger ops, LWW sync, CSV
│   │   ├── money.mjs              # pure balance math + sync merge rule (tested)
│   │   ├── analytics.mjs          # local insights: trends, breakdowns, drift, outliers (tested)
│   │   ├── askSql.js              # allowlist validator for assistant-written SQL (tested)
│   │   ├── gemini.js              # all AI prompts/calls
│   │   ├── push.js                # web-push sender
│   │   ├── svgSanitize.js         # cleans AI-drawn category icons
│   │   ├── noteMatch.js           # note normalization + history matching (shared client/server)
│   │   └── client/                # browser-side
│   │       ├── store.jsx          # React context: state + sync engine
│   │       ├── idb.js             # IndexedDB (cache + offline outbox)
│   │       ├── applyParsed.js     # turns parsed voice/text/receipt output into entries
│   │       ├── exporters.js       # CSV/PDF/JSON export engine
│   │       ├── period.js          # day/week/month/year ranges
│   │       ├── speech.js          # speech in and out for the assistant
│   │       ├── shareTarget.js     # picks up images shared into the app
│   │       ├── dailyCache.js
│   │       ├── pushClient.js      # push subscription helpers
│   │       └── constants.js       # categories, account types, money utils
│   └── components/
│       ├── App.jsx  Nav.jsx  Landing.jsx  AuthView.jsx  ErrorBoundary.jsx
│       ├── TxItem.jsx  FilterRow.jsx  AmountInput.jsx  InsightCarousel.jsx  Markdown.jsx
│       ├── InstallPrompt.jsx  NotifyNudge.jsx  SyncBadge.jsx  ThemeToggle.jsx
│       ├── AccountsSummary.jsx  BudgetsPanel.jsx  CategoriesPanel.jsx
│       ├── AccountIcon.jsx  CategoryIcon.jsx  HoldingIcon.jsx
│       ├── views/    Dashboard · Ledger · Money · Budgets · Insights · Settings
│       ├── money/    AccountsPanel · SavingsPanel
│       ├── modals/   TxModal · VoiceModal · PromptModal · BudgetModal · ExportModal
│       │             AccountModal · AddAccountModal · HoldingModal · ReconcileModal · ConfirmModal
│       └── charts/   Donut · TrendBars · CategoryBars · Bars
├── test/                          # money · analytics · asksql (node:test)
├── public/                        # PWA: manifest (shortcuts, share target, widget), sw.js, icons
├── design.md                      # design system
├── privacy-design.md              # end-to-end encrypted "private mode" (design only, not built)
└── start-rupeeflow.bat            # Windows: install deps, open the browser, run dev
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

### Clearing "Other" off old transfers

Uncategorised used to be saved as the category `Other`, which is also a real
category someone can pick — so an unlabelled transfer and a deliberate "Other"
were indistinguishable, and "show me what still needs a category" could not
work. New entries store an empty category instead.

Existing transfers keep `Other` and are read as uncategorised everywhere, so
this is optional tidying rather than a required migration:

```sql
UPDATE transactions
   SET category = '', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000, rev = rev + 1
 WHERE type = 'transfer' AND category = 'Other' AND deleted = 0;
```

```bash
npx wrangler d1 execute rupeeflow-db --remote --command "UPDATE transactions SET category = '', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000, rev = rev + 1 WHERE type = 'transfer' AND category = 'Other' AND deleted = 0;"
```

Scoped to transfers on purpose. On an expense or income, `Other` may well have
been chosen deliberately — balance adjustments write it on purpose — and
clearing those would destroy a distinction that cannot be recovered.

`updated_at` is bumped so the change syncs to every device; without it the
rows look unchanged and each device keeps its old copy.

### Clearing out deleted entries

A deletion is a soft delete: the row stays with `deleted = 1`. That is not a
recycle bin — it is how the deletion reaches your other devices. Sync is
incremental (`pullTransactions` sends only rows with `updated_at > since`), so
an absent row reads as *unchanged*, not *deleted*. The tombstone is the only
thing that says "this is gone", and a device that never sees one will push the
entry back up.

So purge only tombstones old enough that every device has certainly synced past
them:

```sql
DELETE FROM transactions
WHERE deleted = 1
  AND updated_at < (strftime('%s','now') - 2592000) * 1000;
```

```bash
npx wrangler d1 execute rupeeflow-db --remote --command "DELETE FROM transactions WHERE deleted = 1 AND updated_at < (strftime('%s','now') - 2592000) * 1000;"
```

Count first if you want to see what will go:

```sql
SELECT COUNT(*) FROM transactions WHERE deleted = 1;
```

Deleting **every** tombstone regardless of age is only safe when each device
has synced since the last deletion — otherwise the entries come back:

```sql
DELETE FROM transactions WHERE deleted = 1;
```

## Run locally

```bash
npm install
cp .env.example .env    # fill in the CLOUDFLARE_* vars, JWT_SECRET, GEMINI_API_KEY
npm run dev              # http://localhost:3000
npm test                 # money math, sync merge, analytics, Ask SQL guard (node:test, no deps)
```

On Windows, double-click `start-rupeeflow.bat` instead: it installs dependencies, opens the browser and starts the dev server.

The balance math and the sync merge rule live in `src/lib/money.mjs` as pure
functions over plain data, deliberately outside React so they can be asserted
on directly. Every case in `test/money.test.mjs` is a bug that actually
shipped — a deleted entry resurrected by its own pre-delete copy, a transfer
to a non-existent account cancelling its own outflow, an investment counted
as spending, a sale for more than cost basis losing the profit. Those are the
failures that lose trust permanently, so they get assertions rather than
vigilance. The same goes for `test/analytics.test.mjs` (the local insights)
and `test/asksql.test.mjs`, which checks that assistant-written SQL can never
reach another user's rows or write anything.

Push notifications are optional. Leave the `VAPID_*` and `CRON_SECRET` vars blank to skip that setup (see `.env.example` for what each one does). To turn them on, generate keys with `npx web-push generate-vapid-keys`, then point four triggers from any external cron service at `/api/cron/notify?slot=morning`, `afternoon`, `evening` and `late`, each sending `Authorization: Bearer <CRON_SECRET>`. Set `NEXT_PUBLIC_SITE_URL` to your deployed origin so shared images and link previews resolve.

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
