# Progress

## M0 Scaffold: done
- pnpm monorepo: `apps/mobile` (Expo 57 + Expo Router, 5 tabs), `apps/api` (Fastify + Prisma/CockroachDB), `packages/shared` (units + tests).
- `GET /healthz` with test; CI in `.github/workflows/ci.yml`; `apps/api/.env.example`.
- Prisma schema covers every table in BRD section 8 (validates).
- `init` migration applied to CockroachDB (`prisma migrate status`: up to date).
- Two hand edits to `migrations/*_init/migration.sql`, both CockroachDB quirks:
  - Removed the `DROP TYPE "crdb_internal_region"` that Prisma generates for multi-region databases; Cockroach refuses it.
  - Added `SET create_table_with_schema_locked = false;` at the top, since new tables are schema-locked by default and block Prisma's FK `ALTER TABLE`s.
- **Watch out:** `prisma migrate dev` may generate that `DROP TYPE` again in later migrations. Delete it from each new migration.sql before applying (use `migrate dev --create-only`, edit, then `migrate deploy`).

## M1 Auth: API done and tested; mobile screens written, not yet tried on a device
**API** (`apps/api/src/routes/auth.ts`): signup, verify-email, resend-code, login, refresh (rotating, reuse detection), logout, logout-all, forgot/reset password, change-password, change-email (two-step), `GET /reset` fallback page, minimal `GET /me`.
- Argon2id hashing; 6-digit codes and reset tokens stored as keyed HMAC hashes; refresh tokens 30 days, rotated on every use; access JWT 15 min.
- Rate limits are DB-backed (`rate_events` table): login 5 fails/15 min per email and 20/15 min per IP, reset 3/hour per email, signup 20/hour per IP, resend cooldown 60 s, 5 attempts per code (incremented atomically before comparing).
- Mailer module (`src/mailer`): `smtp` (Nodemailer) | `resend`, retry with backoff, logging. With no provider credentials it logs mail to the console instead of sending (dev only).
- Migration `auth_support`: `email_tokens.new_email` and `rate_events`.
- Tests: `pnpm --filter @wid/api test`. Auth tests are integration tests against the DB in `apps/api/.env` (throwaway `@test.invalid` users, deleted afterwards) and **skip when `DATABASE_URL` is unset** (so CI skips them for now). They take about 2 minutes because of cloud DB latency.

**Mobile**: tokens in SecureStore, API client with single-flight refresh, login / signup / forgot / verify / reset screens, `weighinduel://reset?token=` deep link, route gating with `Stack.Protected`. Set `EXPO_PUBLIC_API_URL` (see `apps/mobile/.env.example`).

**Known gaps**
- Gmail SMTP sending is untested (needs `SMTP_USER` / `SMTP_PASS` in `.env`).
- The reset email link opens the web fallback page, which hands off to the app via the custom scheme. Universal links / app links need a real domain (M7).
- Terms and Privacy screens don't exist yet (M7); the signup switch only records acceptance.
- A password reset or change doesn't invalidate access tokens already issued; they expire within 15 min.

## Web (Expo web)
The app also runs in the browser (`pnpm --filter @wid/mobile exec expo start --web`; `expo export --platform web` builds a static single-page bundle). Tokens use SecureStore on native and localStorage on web (`lib/storage.ts`). The API allows the web origin through `CORS_ORIGINS` / `WEB_APP_URL`. Web photo uploads PUT straight to R2, so the bucket needs a CORS rule for the web origin.

## M2 Onboarding, daily log, profile: API and mobile written; not tried on a device
**API**: `GET/PATCH /me` (full profile with start weight, streak, goal warning), `PUT/GET/DELETE /weigh-ins`, `POST /uploads/photo-url` (R2 pre-signed PUT, 503 `PHOTOS_UNAVAILABLE` when R2 is unconfigured). Migration `onboarding` adds `users.onboarded_at`. 9 integration tests in `test/weigh-ins.test.ts`.
**Mobile**: 3-step onboarding gate (unit, start/goal weight, reminder time; the push permission prompt waits for M6), Log screen (date stepper back 14 days, LCD readout, custom keypad, scale photo, yes/no toggles, mood, notes), Profile editing and change password. Query cache is cleared on sign-out.
**Known gaps**: R2 not configured so photo upload is untested; AI scale reading arrives in M5; reminder time is stored but nothing sends it until M6.

## M3 Groups and race: API tested; mobile screens written, not tried on a device
**API** (`apps/api/src/routes/groups.ts`): create / list / read / edit, join by code (with preview), leave, remove member, transfer, end, regenerate code, leaderboard, series (`lost` | `pct` | `weight`), feed, and a `/join/:code` share-link landing page.
- Privacy lives in one pure function, `viewPermission` (`packages/shared/src/score.ts`), used by the leaderboard, series and feed. Under "% lost only", other members never see weights; they see only the metric the group scores on. Notes are never returned by any group endpoint. The photo switch hides other members' scale photos; you always see your own.
- Baselines resolve lazily (BRD 4.5): the latest weigh-in within 3 days on or before the start date, else the first weigh-in after joining. Once found it is stored.
- A group freezes when its end date passes (checked on read, no cron) or when the owner ends it; ending early sets the end date to today. Weigh-ins after the end date never count.
- If the owner leaves, ownership passes to the longest-standing member; if nobody is left the group ends.
- Rate limits: 10 group creations/day per user, 15 code lookups per 15 min per user.
- Tests: `apps/api/test/groups.test.ts` (integration, real DB) and `packages/shared/src/score.test.ts` (pure `viewPermission`, `dailyScore`, `progress`).

**Mobile**: Race tab (list, create, join), group screen (leaderboard, chart, feed, invite share/copy, leave), owner Manage screen. `weighinduel://join?code=ABC234` deep-links to the join screen.

**Deviation to confirm:** the race chart uses `react-native-svg` (hand-drawn lines) instead of victory-native/Skia. Skia needs the CanvasKit wasm on web, which is fragile; react-native-svg renders identically on iOS, Android and web. Swapping later only touches `components/chart.tsx`.

**Known gaps**: avatars are not built yet (initials only, none shown); the feed shows the latest 30 and has no "load more" button; no push notifications for joins or the winner until M6.

## Photo upload: stored in CockroachDB (deviation from the BRD, by your choice)
Photos live in the `photos` table (`bytea`). The "pre-signed" URLs point back at this API (`PUT /photos/upload`, `GET /photos/file`) and carry an HMAC signature and expiry, so uploads and image loads need no auth header. Hard limits: 450 KB per photo (the app compresses to 1024 px JPEG and steps quality down to fit 400 KB), JPEG/PNG/WebP only (checked by magic bytes), single-use upload links, 40 uploads/day per user. Deleting an entry deletes its photo; deleting a user cascades.
- **R2 is still supported:** fill in the four `R2_*` values in `apps/api/.env` and the API switches to R2 automatically (then the bucket needs private access, an Object Read & Write token, and a CORS rule for the web origin: `PUT`/`GET`, header `Content-Type`). Existing DB photos would not be migrated automatically.
- **Why it's not ideal long term:** photos bloat the database, add to request-unit cost, and are served through the API. Fine for a friends-sized app.
- **Gaps:** photos uploaded but never attached to an entry are orphaned (no cleanup job yet); the 1-second DB latency applies to every image load.

## M4 — Patterns

- `packages/shared/src/analytics.ts`: per-habit hit rate, avg daily change when done vs skipped, verdict (good / small / none / need_more), week-by-week table, daily score bands. Unit tested.
- API: `GET /patterns/me?days=` and `GET /patterns/:groupId/:userId` (403 `PATTERNS_HIDDEN` unless the group privacy is "actual"). Queries select only date, weight, habits and mood; notes are never read.
- Mobile: **Why** tab with overlay chart (weight line + score bars, hand-drawn with react-native-svg), habit table and weekly table, 30/90/180-day ranges. Leaderboard rows link to a member's patterns when the group is "actual".
- Not yet: Coach button (M5).

## M5 — AI (Anthropic API, server-side only)

- `apps/api/src/ai/`: `AiClient` seam over `@anthropic-ai/sdk` (tests use `FakeAi`), `AiGate` (per-user daily limits from `ai_usage`, global `AI_DAILY_BUDGET_USD` cap, usage + cost logging). Costs are estimates from a built-in price table.
- `POST /ai/scale-read` (15/day, Haiku): reads your own uploaded photo, validates the JSON, treats readings outside 25–300 kg as unreadable, converts to your unit. The app only *suggests* the number; you tap "Use" to confirm, and low confidence says "Best guess, check before saving".
- `POST /ai/coach` (3/day, Sonnet) streams server-sent events. Sends the last 45 days (numbers, habits, mood, notes cut to 80 chars) plus computed habit effects and weekly table. No name or email goes to the model. Cached 12 h in `coach_readings` unless the data changed; cached reads and the "too few days" reply don't use up the daily limit.
- `POST /ai/recipe` (10/day, Sonnet) validates the recipe JSON with zod; craving text is sanitised. `GET/POST/DELETE /recipes` for saved recipes (max 100).
- Without `ANTHROPIC_API_KEY` the AI endpoints answer 503 `AI_UNAVAILABLE`; when the daily budget is spent, 503 `AI_RESTING`.
- Mobile: Coach card on **Why**, **Cravings** tab (chips, preferences saved to profile, recipe card, "Give me a different one", Save), **Saved recipes** screen (linked from Profile and Cravings), scale reader suggestion on the Log photo.
- Not done: group standings in the coach prompt (BRD marks it optional/"if privacy allows"). Not verified against the real Anthropic API yet (needs a key); tests use a fake model.
- Migration `20261014180000_coach_readings`.

## M6: Notifications (done)
- API: `notify/` (Notifier, Expo push sender, scheduler), `/push-tokens`, `/notifications` (+ `/read`), `/notification-prefs`, signed `/unsubscribe`.
- Every notification has a unique `dedupeKey`, so the 5-minute scheduler (with a 30-minute catch-up window) never double-sends, even after a restart.
- Quiet hours (default 22:00–07:00 in the user's time zone) silence push only; the inbox and email are unaffected.
- Types: daily reminder, streak at risk, member joined, overtaken, digest (off by default), weekly recap (+email), competition start / ending soon / ended with winner (+email). Overtaken uses `group_members.last_rank`.
- Mobile: push registration (native, skipped silently without an EAS `projectId` or on simulators), tap-to-open deep links, inbox with unread badge in the tab header, per-type push/email settings (Profile → Notification settings).
- Fixed along the way: `groupJobs` was decorated inside an encapsulated plugin so the scheduler could not see it; the groups plugin now skips encapsulation.
- Not verified on a real device: Expo push delivery.

## M7: Ship (done, pending your accounts)
- Account: `POST /me/export` (CSV emailed as an attachment, 3/day, spreadsheet-formula-safe), `DELETE /me` (password required; owned groups go to the longest-standing member or are removed; winner references cleared; photos deleted; confirmation email).
- Mobile: export and delete in Profile, Privacy/Terms screens (linked from signup and Profile). **The legal text is a draft and needs a lawyer's review before public launch.**
- Sentry: API (`SENTRY_DSN`) and mobile JS (`EXPO_PUBLIC_SENTRY_DSN`); both are no-ops when unset. Source-map upload plugin intentionally not enabled.
- Assets: generated placeholder icon / adaptive icon / splash in `apps/mobile/assets`. Replace with real artwork.
- `apps/mobile/eas.json` has development / preview / production profiles. Replace `https://api.example.com` with your deployed API URL.

### Remaining steps only you can do
1. Set `ANTHROPIC_API_KEY`, `AI_DAILY_BUDGET_USD`; SMTP or Resend credentials (`RESEND_API_KEY`, `MAIL_FROM`); `REQUIRE_EMAIL_VERIFICATION=true` in production.
2. Deploy the API (any Node 22 host, e.g. Fly/Render/Railway): `pnpm --filter @wid/api build`, `prisma migrate deploy`, `pnpm start`. Set `APP_BASE_URL` to the public URL, `SCHEDULER_ENABLED=true` on exactly one instance, and a strong `JWT_SECRET`.
3. `cd apps/mobile && eas login && eas init` (writes the `projectId` push needs), then `eas build -p ios|android --profile preview`.
4. Apple Developer / Google Play accounts, store listings, and a real domain for universal links.
5. Host the web build: `npx expo export --platform web` → static hosting; set `EXPO_PUBLIC_API_URL` first.
