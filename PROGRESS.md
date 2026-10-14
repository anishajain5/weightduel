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
