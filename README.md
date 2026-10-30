# Challenge Tracker

**Live:** [challenge-tracker-bay.vercel.app](https://challenge-tracker-bay.vercel.app) · **Code:** [github.com/Jaloliddin-Kulmatov/Challenge_Tracker](https://github.com/Jaloliddin-Kulmatov/Challenge_Tracker)

A reusable, multi-user challenge-tracking product: define **any** challenge (running, studying, reading,
workouts, habits with no numbers at all…), get an automatically generated schedule, log progress from your
phone, and see accurate statistics, pace, streaks and charts. Built mobile-first.

**Stack:** Next.js 16 (App Router) + TypeScript · Tailwind CSS 4 + Radix primitives · PostgreSQL ·
Drizzle ORM (SQL migrations) · Better Auth (email + password, DB-backed sessions) · Zod · Recharts ·
Vitest + Playwright.

---

## Features

| Area | What you get |
|---|---|
| Challenges | Category, tracking method (**number + unit** or **done / not done**), start/end date, colour; templates or from scratch |
| Targets | **Every day**, **chosen weekdays** (weekly total split evenly *or* a custom target per weekday), **weekly goal on any days**, or **one overall goal** |
| Schedule | Generated automatically; move, retarget, skip or add sessions; future targets can change without touching history |
| Logging | One-hand quick-log sheet (steppers, "remaining" chip), multiple logs per day, back-dating, notes, idempotent (double-tap safe) |
| Analytics | Progress %, pace vs plan, adherence, missed sessions, streaks, best day, cumulative + weekly charts (with table views) |
| Lifecycle | Edit duration, pause/resume (end date shifts), start in the future, finish early, results review, archive, delete |
| Extras | Milestones (auto 25/50/75/100 % + custom), achievements, read-only share links (revocable/expiring), JSON data export, notification preferences |

## Email reminders

The plan page has a one-tap **Evening email reminder** (default 23:30, in your own time zone): it emails what is still
unticked today, once a day, and stays quiet when everything is ticked.

How it works: a scheduler calls `POST /api/cron/reminders` every 15 minutes with `Authorization: Bearer $CRON_SECRET`
(`.github/workflows/reminders.yml`; Vercel Hobby crons only run once a day, GitHub Actions is free and every 15 minutes).
The endpoint sends every reminder that is due (from the chosen time for 3 hours, so a late run still catches up) and is
idempotent: `reminder_log` has one row per user per local day, claimed before sending.

Set up once:

1. Create a [Resend](https://resend.com) account and an API key. Without a verified domain, Resend only delivers to
   your own account email, which is enough for a personal tracker.
2. Vercel → Settings → Environment Variables: `RESEND_API_KEY`, `CRON_SECRET` (any long random string) and optionally
   `EMAIL_FROM`; redeploy.
3. GitHub → Settings → Secrets and variables → Actions: `CRON_SECRET` (same value) and `APP_URL`
   (e.g. `https://challenge-tracker-bay.vercel.app`).
4. On the plan page switch the reminder on and press **Send me a test email**.

## Telegram bot (reminders you can tap)

Besides email, the plan page has a **Telegram reminder**: every evening (same time as the email, default 23:30) the bot
sends the tasks you haven't ticked as buttons – tap one and it is ticked (the message updates). `/today` shows today's
tasks any time, `/stop` disconnects.

* Connecting: **Connect Telegram** opens the bot with a one-time code (valid 15 minutes, stored hashed, single use);
  pressing *Start* links that chat to your account. A chat can belong to one account only.
* Taps use exactly the same rules as ticking on the website (your own plan, valid task, not in the future).
* `POST /api/telegram/webhook` only accepts calls carrying `TELEGRAM_WEBHOOK_SECRET` (Telegram sends it in
  `X-Telegram-Bot-Api-Secret-Token`); the 15-minute cron (and *Connect Telegram*) registers the webhook, so there is no
  manual `setWebhook` step. If someone blocks the bot, the link is removed automatically.

Set up once:

1. In Telegram open **@BotFather** → `/newbot` → pick a name and a username ending in `bot`. Copy the token.
2. Vercel → Environment Variables: `TELEGRAM_BOT_TOKEN` (the token), `TELEGRAM_BOT_USERNAME` (without the @) and
   `TELEGRAM_WEBHOOK_SECRET` (any random string of letters, digits, `_` or `-`); redeploy. Keep `CRON_SECRET` and the
   GitHub secrets from *Email reminders* – the same schedule sends the Telegram messages.
3. On the plan page press **Connect Telegram**, then **Start** in the chat. **Send me today's tasks now** is the test button.

## Install on your phone (PWA)

The app is installable: `src/app/manifest.ts` (standalone, opens on `/plan`, themed icons incl. a maskable one in
`public/icons/`), a small service worker (`public/sw.js`: caches only static build files, never pages or API data, and
shows `public/offline.html` when the connection drops) and an install prompt (`src/components/pwa.tsx`).

* **Android / Chrome**: an *Install* banner appears, or Settings → *Install on your phone* → *Add to home screen*.
* **iPhone / iPad**: open the site in **Safari** → Share → *Add to Home Screen* (the app shows these steps; Apple gives
  websites no install button).
* Needs HTTPS, which Vercel provides. The service worker only registers in production builds.

## Semester plan (checklist tracker)

`/plan` is a ready-made, tick-as-you-go tracker for the **"Semester 4 – Malaysia (Oct 19 – Feb 28)"** plan: overall goals,
today as an hour-by-hour timeline (classes from the timetable + study, meals, exercise at 19:00; 9 ticks Mon–Sat, a short rest-day list on Sunday; also available as a plain checklist), monthly goals (this month + next), a card for each of
the 19 weeks (with the weekly goals and a Sunday "log the numbers" form), and the weekly class schedule with exercise at 19:00.

* The plan's *default content* lives in code (`src/lib/plan/malaysia-semester4.ts`). Everything the user edits on
  `/plan/edit` (goals, daily tasks and their weekdays/time, weekly goals, books, monthly targets and results, weekly
  tasks) is stored as one validated JSON document in `plans.content` and laid over the default
  (`src/lib/plan/content.ts`); items keep their ids, so ticks follow a renamed task and a removed task's ticks stop
  counting. Ticks (`plan_checks`) and the Sunday numbers (`plan_metrics`) are stored separately, one `plans` row per user.
* The timeline (`src/lib/plan/timeline.ts`) merges the fixed class timetable with editable blocks, checks that blocks don't overlap, and drives the *Analysis* section (hours per kind of activity per day, sleep, late workouts, tasks without a slot).
* Monthly numbers (weight, long run, books finished) are compared with each month's targets; the
  weight target is a straight line from the first logged weight to the goal unless a month sets its own.
* Rules (`src/lib/plan/logic.ts`): daily ticks only for today or earlier days and only on days a task applies; weekly
  goals only once the week has started; week-specific tasks, monthly results and goals may be ticked any time.
* A failed save is undone on screen and reported – a tick never looks done unless the server stored it.
* To add another plan, add a template next to the Malaysia one and register it in `src/lib/plan/templates.ts`.

## Quick start (local)

Requirements: Node ≥ 20.9, PostgreSQL ≥ 14 (Docker is the easiest way).

```bash
cd challenge-tracker
cp .env.example .env              # then set BETTER_AUTH_SECRET:  openssl rand -base64 32
docker compose up -d db           # or use any Postgres and edit DATABASE_URL
npm install
npm run db:migrate                # applies ./drizzle/*.sql
npm run dev                       # http://localhost:3000
```

Optional – explore with a **clearly labelled demo account** (sample data generated by a script, flagged
`is_demo`, shown with a banner in the UI; never mixed with real users):

```bash
ENABLE_DEMO_SEED=true npm run db:seed     # demo@example.com / demo-password-123
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (server-side only) |
| `BETTER_AUTH_SECRET` | yes (prod) | Signs sessions/cookies. ≥ 32 random chars. Never commit it |
| `BETTER_AUTH_URL` | yes | Public base URL, e.g. `https://tracker.example.com` (also the trusted origin) |
| `BETTER_AUTH_TRUSTED_ORIGINS` | optional | Extra origins allowed to sign in (comma-separated). Vercel's own deployment/branch/production URLs are trusted automatically; without this, any other hostname gets "Invalid origin" |
| `TEST_DATABASE_URL` | tests | Disposable DB whose name **must end in `_test`** (it is wiped) |
| `E2E_DATABASE_URL` | e2e | Disposable DB whose name **must end in `_e2e`** |
| `ENABLE_DEMO_SEED` | seed only | Must be `true` for `db:seed` to run |
| `DATABASE_PREPARE` | optional | `false` for transaction-mode poolers (auto for Supabase pooler URLs) |

No secret is ever exposed to client code: the database and auth secret are only read in server modules,
and the browser talks to server actions / the Better Auth endpoint.

### Scripts

```bash
npm run typecheck         # tsc
npm test                  # unit tests (pure business logic)
npm run test:integration  # real-PostgreSQL integration tests (needs TEST_DATABASE_URL)
npm run test:all          # both
npm run build && npm run test:e2e   # Playwright journey on a phone viewport and on desktop
npm run db:generate       # create a new migration after editing src/lib/db/schema.ts
npm run db:migrate        # apply migrations
```

## Deployment

1. Provision PostgreSQL (Supabase, Neon, RDS, … – any Postgres ≥ 14). With Supabase use the **pooled**
   connection string; prepared statements are disabled automatically for it.
2. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` on the host.
3. Migrations: on **Vercel this is automatic** – the `vercel-build` script runs `tsx scripts/migrate.ts` (idempotent) before `next build`, so every deploy creates/updates the tables in the database `DATABASE_URL` points to. On other hosts run `npm run db:migrate` as a release step.
4. `npm run build && npm run start` – or deploy to Vercel / any Node host / a container (`next start`, port 3000).
5. Health check: `GET /api/health` – returns `ok`, or says what is missing: `migrations_missing` (run `npm run db:migrate`), `auth_secret_missing`, or `database_unavailable`.

The app is a stateless Next.js server; scale horizontally behind any load balancer.

## Architecture

```
src/
  lib/core/        PURE domain logic – no I/O, no React. dates/time zones, schedule generation, progress,
                   streaks, milestones, achievements, formatting. 59 unit tests.
  lib/db/          Drizzle schema + client. Migrations in ./drizzle (SQL, committed).
  lib/validation/  Zod schemas for every input.
  lib/services/    Use-cases (transactions, authorization, derived-state sync). Throw AppError.
  lib/auth/        Better Auth config, session helpers.
  app/actions/     Thin server actions: authenticate → call a service → {ok|error}. Never throws to the UI.
  app/             Pages (server components) – read via services.
  components/      Client components (forms, sheets, charts).
tests/{unit,integration,e2e}
```

Business logic never lives in components: the UI's live schedule preview calls the *same* `generateSlots`
the server uses.

### Data model

`user` · `challenges` (owner, category, tracking method, unit, dates, status) · `challenge_configurations`
(versioned target rules: the latest rule effective on/before a date governs it) · `scheduled_activities`
(session / weekly-window / overall-goal slots with a per-slot target) · `activity_logs` (value, unit,
`occurred_at`, frozen `local_date` + `timezone`, notes, optional slot, idempotency key) · `challenge_pauses`
· `milestones` · `achievements` · `challenge_shares` · `notification_preferences` (+ Better Auth tables).

Integrity is enforced in the database too: foreign keys with cascades, `CHECK` constraints (positive values,
date ordering, unit ⇔ quantity tracking, max duration…), one open pause per challenge, unique idempotency
keys, indexes on every lookup path.

**Access control:** every row belongs to a `user` through `challenges.owner_id`; every service call loads
data through an owner-scoped query and answers *"not found"* for anything else (existence is never
revealed). Covered by the authorization integration tests. Shared links expose statistics only (no email,
no other challenges, notes only if the owner opted in) and can be revoked or expire. For defence in depth
you can additionally enable Postgres RLS if you expose the DB to clients (Supabase); the app itself only
connects server-side.

### How the edge cases behave

| Case | Behaviour |
|---|---|
| Change duration midway | Lengthen: sessions added at the end. Shorten: unlogged sessions past the new end are removed. Never earlier than the last logged day. |
| Missed session | Derived (past window, target not met) – so adding/deleting a log immediately corrects it. Skipping a session excuses it. |
| Exceed a target | Slot shows `+N %`, overall % is uncapped (e.g. 120 %), "Overachiever" badge; target-reached prompts to finish. |
| Several logs in a day | All count; they attach to the day's session and sum. Extra logs on unscheduled days count toward the total. |
| Change a future weekly target | A new versioned rule from the chosen date; only still-open, un-edited, unlogged future sessions regenerate. Weekly-window rules start on the next Monday. |
| Pause / resume | Paused days are *excused* (not missed, don't break streaks); resuming extends the end date by the days paused. Logging while paused is blocked. |
| Starts in the future | "Starts in N days"; logging is rejected until the start date; nothing counts as missed. |
| No numeric measurement | `completion` tracking: each log is one "done"; targets are counts. |
| Delete a log | Stats, streaks, milestones and achievements are recomputed from the logs (a milestone can become un-reached). |
| Change time zone | Schedules are calendar dates; each log stores its own local date + zone, so history never moves. Only "today" follows the new zone. |
| No challenges / no history | Empty states; all calculations return zeros/nulls (never `NaN`). |
| Finish early | Results are locked in; later sessions stop counting; "Early finisher" badge. |
| Backend failure | Actions return `{ ok: false }`; the UI shows the error and **never** shows success. Writes are transactional; a challenge row lock serialises concurrent edits. |

## Testing

* **Unit (59):** target splitting, schedule generation, rule versioning, progress %, pace, streaks, missed
  sessions, multiple logs, pause/early completion, milestones, achievements, time-zone boundaries & DST.
* **Integration (35, real PostgreSQL):** create/edit/extend/shorten, pause/resume, complete, log CRUD +
  idempotency + concurrency, time-zone handling, DB constraints, persistence on a fresh connection, and
  **data authorization** (a second user cannot read or mutate anything).
* **End-to-end (Playwright):** signup → create → log (incl. validation errors) → charts → edit → pause/resume →
  delete a log → finish early → results → log out → log in → data is still there. Runs on a Pixel 7 viewport
  and on desktop.

## Notifications

Preferences (daily reminder time, weekly summary, channel) are stored per user, **but nothing is sent** –
delivery needs a provider whose credentials only you can supply. To enable it, add a scheduled job (cron /
Vercel Cron / a worker) that reads `notification_preferences`, computes each user's local time from
`user.timezone`, and sends through your provider (e.g. Resend, SES, web-push) with its API key in a
server-side environment variable.

## Known limitations / next steps

* No email verification or password reset yet (needs an email provider – wire it into Better Auth's
  `sendResetPassword` / `sendVerificationEmail` hooks).
* Notification *delivery* is not implemented (see above).
* Switching between an overall-goal schedule and a day-by-day schedule is only possible before a challenge
  starts (create a new challenge afterwards).
* Dashboards compute statistics on read; for very large histories add a cached summary table.
