# Private mode — design notes

**Status: not built.** This is a design record, written after a conversation
about storing user data privately. Nothing here is implemented. Read it before
starting, and update it if the decisions change.

## Why

A prospective user asked, reasonably: *"if you store my expenses and income,
who else can see them?"* Today the answer is "we can" — D1 holds readable
rows, and `buildSummary()` sends aggregates, item notes and account names to
Google's Gemini API from the server.

The goal is to be able to answer honestly: **"nobody. We hold ciphertext we
cannot decrypt."**

## Where the app already is

Worth knowing before planning work, because it is most of the way there:

- **IndexedDB is already the primary store.** The app writes locally first
  (`store.jsx`), reads from cache on boot (`hydrateFromCache`), and syncs to
  D1 in the background. The server is a sync relay, not the source of truth.
- **The analysis is already local.** `src/lib/analytics.mjs` computes the
  month/quarter/year breakdowns, category shares, outliers, price drift and
  missing bills entirely on-device, with no API call.
- **Only the assistant needs the server.** Chat, coach cards and the weekly
  review are the sole features that require readable data off-device.

So private mode is mostly *removing* a dependency, not building a new engine.

## The decision: encrypted D1, not Google Drive

Both were considered. Encrypted D1 wins on effort by a wide margin.

| | Encrypted D1 | Google Drive `appDataFolder` |
|---|---|---|
| Sync engine | Reuses outbox + LWW merge unchanged | Second transport to write and debug |
| Auth | None new | OAuth, token refresh, revocation |
| Approval | None | **Google verification** — weeks, needs privacy policy and demo video; unverified apps show a warning screen |
| Users without a Google account | Fine | Locked out |
| Actual security | Server holds ciphertext | Readable by whoever holds the token |

Drive's advantage is emotional — *"it's in my Drive"* — not technical. That is
a legitimate reason to offer it eventually, but it is paying for perception,
and it should not block shipping the security benefit.

**Plan: encrypted D1 first. Drive later as a storage-location option, if
anyone actually asks for it.**

## What encryption costs (decided, not negotiable)

These follow from real client-side encryption. They are the price, not
implementation shortcuts:

1. **Admin cannot read user data.** No debugging a user's wrong balance by
   looking, no restoring lost data, no server-side migrations over real rows.
   A privacy guarantee that can be overridden is not one.
2. **No server-side AI in private mode.** The AI has no special powers — it is
   an API you POST text to. It cannot decrypt. For it to answer questions,
   something must hold plaintext. Decrypting on-device and sending that to
   Google is the same exposure by a longer route, not more private.
3. **No password reset for the data.** Lose the key and the recovery phrase
   and the data is gone permanently, for the user and for us.

For (1) there is an honest middle path if support becomes a problem:
a **"share diagnostics with support"** button where the *user* decrypts and
sends a snapshot deliberately. Access by consent, not by backdoor.

## Modes

The storage choice is made at signup and drives what AI is available:

| Mode | Data at rest | AI |
|---|---|---|
| **Cloud** (default) | Readable in D1, as today | Full — chat, coach, item questions |
| **Private** | AES-GCM ciphertext in D1 | Local analytics only |

Framing for the user: *"Want AI? It needs readable data on our server. Want
privacy? Your data stays unreadable to us, and the app still analyses it on
your device."*

Cloud should stay the default and Private an informed opt-in — some users
**will** lock themselves out, and that should be a choice they made knowingly.

Mode switching should be allowed both ways, and each direction is real work:
Private → Cloud decrypts and uploads; Cloud → Private re-encrypts and needs a
genuine "delete my server data" path.

## Key management — the actual hard part

The crypto is small (WebCrypto AES-GCM, on the order of 50 lines). Key
handling is where this succeeds or fails.

### The failure this must survive

*User clears site data, signs in again.*

Today that is harmless: IndexedDB is wiped, they log in, the app re-downloads
from D1. With encryption, clearing site data also destroys the key. They would
pull down all their ciphertext and be unable to read a byte of it. The login
password does not help — it authenticates them to the server, it does not
decrypt anything.

Naive implementation = **cleared cache destroys the data**. Unacceptable for a
finance app; people clear caches, replace phones and reinstall browsers.

### The fix: derive the key, do not merely store it

```
key = PBKDF2(passphrase, salt = user id, ~200k iterations, SHA-256)
```

IndexedDB then holds a *cache* of the key, not the only copy. Clear the cache,
log in, type the passphrase, and the identical key is re-derived. Same on a new
device. Nothing about the key ever reaches the server.

That turns "cleared cache = data destroyed" into "cleared cache = type your
passphrase once", which is how password managers already behave.

### Passphrase options

- **A — reuse the login password.** Best UX, one secret. Requires deriving the
  key client-side *before* the password is sent, and never transmitting the raw
  password. A password change forces re-encryption.
- **B — separate encryption passphrase.** Cleanly isolated; the server never
  sees it, and password resets do not touch encryption. Costs a second secret
  to remember.
- **C — generated recovery phrase.** 12 random words shown once. Strongest and
  immune to weak passwords, but easy to lose.

**Recommendation: A + C.** Passphrase for daily use, recovery phrase as the
backstop, so losing one does not lose the data.

Escrowing a key copy on the server is *not* an option — it restores admin
access and voids the entire guarantee.

### Required UX guards

- Force confirmation of the recovery phrase at setup (type 3 of the 12 words
  back) — an unconfirmed phrase is an unsaved phrase.
- State plainly: *"We cannot reset this. If you lose it, your data is gone."*
- Push regular JSON exports. The export builder already exists, and a local
  unencrypted backup is a real safety net.

## Rough effort

| Piece | Effort | Notes |
|---|---|---|
| Mode choice at signup + settings | Small | UI plus a flag |
| AES-GCM encrypt/decrypt in the sync layer | Medium | Transport is unchanged; encrypt on the way out, decrypt on the way in |
| Key derivation + recovery phrase + flows | **Medium-high** | The risky part |
| Gating AI by mode | Small | Analytics are already local |
| Drive `appDataFolder` (later, optional) | Medium-high | OAuth, verification, conflicts |

## Open questions

- Which fields get encrypted? Encrypting `occurred_at` and `amount` too would
  break server-side ordering and the CSV export route — likely encrypt
  `note`/`category`/`account` and keep timestamps in clear for sync ordering.
  **Decide before building**; it changes the sync queries.
- What happens to an existing account that switches to Private — migrate in
  place, or require a fresh export/import?
- Does the share-target / service worker path need the key, and if so how does
  it get it while the app is closed?
