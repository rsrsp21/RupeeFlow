# RupeeFlow design system

Quiet, precise, enterprise-minimal. Neutral surfaces, hairline borders, one
restrained accent color. Everything below is sourced directly from
`src/app/globals.css` — if the two ever disagree, the CSS is the source of
truth and this file should be updated to match.

Tagline: **Effortless money tracking**

## Theme

Light and dark are both first-class, toggled via `data-theme="light" | "dark"`
on `<html>`, persisted in `localStorage` (`rf_theme`) and restored before
first paint (see `src/app/layout.jsx`) to avoid a flash of the wrong theme.
Every color is a CSS custom property — components never hardcode a hex value.

### Light (`:root`)

| Token             | Value      | Use                                  |
|-------------------|------------|---------------------------------------|
| `--bg`            | `#fafafa`  | Page background                       |
| `--surface`       | `#ffffff`  | Cards, modals                         |
| `--surface-2`     | `#f4f4f5`  | Recessed panels: form inputs, search bar, tracks — always one step darker/lighter than the `--surface` it sits on, never the same value |
| `--text`          | `#18181b`  | Primary text                          |
| `--muted`         | `#71717a`  | Secondary text, labels                |
| `--line`          | `#e9e9eb`  | Hairline borders                      |
| `--line-strong`   | `#dcdcdf`  | Input borders, stronger dividers      |
| `--accent`        | `#0d9488`  | Brand teal — primary interactive color|
| `--accent-soft`   | `#0d948814`| Tinted backgrounds (8% alpha)         |
| `--accent-text`   | `#0f766e`  | Accent color on light backgrounds     |
| `--red`           | `#dc2626`  | Expenses, errors, risk                |
| `--red-soft`      | `#dc262612`| Tinted red backgrounds                |
| `--green`         | `#059669`  | Income, savings, positive states      |
| `--green-soft`    | `#05966912`| Tinted green backgrounds              |
| `--amber`         | `#d97706`  | Caution / "watch" states              |
| `--amber-soft`    | `#d9770614`| Tinted amber backgrounds              |
| `--amber-text`    | `#b45309`  | Amber label text                      |

### Dark (`[data-theme="dark"]`)

| Token             | Value      | Use                                  |
|-------------------|------------|---------------------------------------|
| `--bg`            | `#0a0a0b`  | Page background                       |
| `--surface`       | `#131315`  | Cards, modals, inputs                 |
| `--surface-2`     | `#1a1a1d`  | Recessed panels                       |
| `--text`          | `#ededef`  | Primary text                          |
| `--muted`         | `#83838c`  | Secondary text, labels                |
| `--line`          | `#232327`  | Hairline borders                      |
| `--line-strong`   | `#2e2e33`  | Input borders, stronger dividers      |
| `--accent`        | `#2dd4bf`  | Brand teal (brighter for dark bg)     |
| `--accent-soft`   | `#2dd4bf14`| Tinted backgrounds                    |
| `--accent-text`   | `#5eead4`  | Accent color on dark backgrounds      |
| `--red`           | `#f87171`  | Expenses, errors, risk                |
| `--red-soft`      | `#f8717114`| Tinted red backgrounds                |
| `--green`         | `#34d399`  | Income, savings, positive states      |
| `--green-soft`    | `#34d39914`| Tinted green backgrounds              |
| `--amber`         | `#fbbf24`  | Caution / "watch" states              |
| `--amber-soft`    | `#fbbf2414`| Tinted amber backgrounds              |
| `--amber-text`    | `#fcd34d`  | Amber label text                      |

### Color usage rules

- **Never hardcode a color** in a component — always reference a `var(--...)`.
- `--accent` is reserved for primary actions and the brand mark. It is not
  a general-purpose highlight color.
- Semantic colors are fixed: red = expense/risk, green = income/save/win,
  amber = caution/watch, accent (teal) = neutral/informational/action.
- "Soft" variants (8–20% alpha) are for tinted backgrounds behind an icon or
  a whole card — never for text (contrast is too low). Use the `-text`
  variant (or the base color) for text/icons on a soft background.
- Category colors (`src/lib/client/constants.js` → `CATEGORIES[...].color`)
  are the one exception to the CSS-variable rule: each of the 20 spending
  categories has a fixed hex swatch used only for chart segments (donut,
  category bars) so a category's color stays recognizable across the app.

## Typography

- Body font: **Manrope** (`--font-body`), loaded via `next/font/google`.
- Display font: **Sora** (`--font-display`), used only for headings and
  numerals: `h1–h4`, `.hero-amount`, `.tx-amt`, `.nav-brand`, `.day-label`.
  Display text gets `letter-spacing: -.02em` and `font-weight: 600`.
- Base body size is `14.5px` (not `16px`) — intentionally compact/dense,
  enterprise-tool feel rather than a consumer app. The one exception:
  form inputs force `font-size: 16px` on mobile viewports to prevent
  iOS Safari's auto-zoom-on-focus.
- Numbers use `font-variant-numeric: tabular-nums` wherever amounts are
  compared vertically (stat rows, ledger amounts) so digits align.

## Shape & elevation

- `--radius: 14px` — cards, modals, the install prompt.
- `--radius-sm: 9px` — inputs, buttons, chips, smaller nested elements.
- `--shadow` — resting elevation for cards (`0 1px 2px rgb(0 0 0 / .04)` light,
  `.3` alpha dark).
- `--shadow-lg` — floating elements: modals, FAB, toast, install prompt.
- Borders are hairline (`1px solid var(--line)`) rather than shadows doing
  the separation work — this is a bordered design system, not a shadow-heavy
  one.

## Motion

Framer Motion throughout. Two flavors, used deliberately:

- **Tweens** (`duration` + `ease`) for content transitions: view changes,
  card fade-ins, list items. Standard easing: `[0.22, 1, 0.36, 1]` (a
  quick-out curve) or plain `'easeOut'` for simple fades.
- **Springs** (`type: 'spring'`) for anything the user directly triggers
  and expects to feel physical: the FAB open/close, the theme-morphing
  `+`/`×` rotation. A CSS `transition` must never target the same property
  a Framer Motion animation is driving on the same element — the two engines
  fight and stutter (see `.fab.mini` vs. `.main-fab` in `globals.css` for
  the pattern: only the element Framer doesn't touch gets a CSS transition).

## Components at a glance

- **Cards** (`.card`): the base content container — surface background,
  hairline border, `--radius`, `--shadow`, 20px padding.
- **Buttons** (`.btn`): `.primary` (solid, high-emphasis), `.ghost`
  (bordered, low-emphasis), `.danger-ghost` (red text, for destructive
  actions). Icon-only actions use `.icon-btn` (transparent, centered icon).
- **Badges/chips**: small pill or rounded-rect labels using a semantic
  soft background + matching text color (e.g. `.badge.expense`,
  `.coach-card.risk`).
- **Nav**: sidebar on desktop (icon + label rail, collapsible), becomes a
  fixed bottom tab bar under 760px.

## PWA capabilities

Declared in `public/manifest.webmanifest`, implemented in `public/sw.js`:

- **Offline** — network-first for pages, stale-while-revalidate for static
  assets, cache-first for CDN libs. `/api/*` deliberately bypasses the SW so
  auth and sync are never served stale.
- **Background Sync** (`sync-outbox` tag) — queued offline entries get pushed
  by the SW even if the app was closed before reconnecting. The auth token is
  mirrored into IndexedDB's `meta` store because a SW can't read
  `localStorage`.
- **Share Target** (POST, multipart) — other apps can share text *or* a
  receipt image into RupeeFlow. The SW stashes the payload in IndexedDB and
  redirects to `/?share=1`; the app consumes it once on boot (text opens the
  quick-add prompt, an image goes straight into the receipt scanner).
- **Push notifications** — a daily "nothing logged yet" nudge and
  budget-overspend alerts, sent by `POST /api/cron/notify` (bearer
  `CRON_SECRET`, scheduled in `vercel.json` for 14:30 UTC / 20:00 IST).
  Requires `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`; without them the feature
  simply stays off. Subscriptions live in the `push_subscriptions` table and
  are pruned automatically when a push returns 404/410.
- **Shortcuts** and **launch_handler: focus-existing** so app shortcuts and
  notification taps reuse the open window instead of spawning duplicates.

Cron times are UTC. `/api/cron/notify` computes "today" and "this month" in
IST to match the client, which derives them from the user's local timezone.

## Layout breakpoint

Single breakpoint at **760px** (`@media (max-width: 760px)`) switches the
sidebar nav to a bottom tab bar, stacks headers into a single column, and
repositions floating elements (FAB, install prompt) to clear the tab bar.
A second, lighter breakpoint at **900px** exists only for the landing
page's two-column hero collapsing to one column.
