-- CockroachDB 25.4+ locks new tables by default; keep new tables alterable.
SET create_table_with_schema_locked = false;

-- AlterTable
ALTER TABLE "email_tokens" ADD COLUMN     "new_email" STRING;

-- CreateTable
CREATE TABLE "rate_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" STRING NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_events_key_created_at_idx" ON "rate_events"("key", "created_at");
