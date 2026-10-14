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
