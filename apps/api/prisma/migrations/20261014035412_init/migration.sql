-- CockroachDB 25.4+ locks new tables by default, which blocks the FK ALTERs below.
SET create_table_with_schema_locked = false;

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('kg', 'lb');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('verify', 'reset', 'change_email');

-- CreateEnum
CREATE TYPE "Scoring" AS ENUM ('pct', 'abs');

-- CreateEnum
CREATE TYPE "Privacy" AS ENUM ('pct_only', 'actual');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" STRING NOT NULL,
    "email_verified_at" TIMESTAMPTZ,
    "password_hash" STRING NOT NULL,
    "display_name" STRING NOT NULL,
    "avatar_key" STRING,
    "unit" "Unit" NOT NULL DEFAULT 'kg',
    "goal_weight_kg" DECIMAL(5,1),
    "height_cm" DECIMAL(5,1),
    "timezone" STRING NOT NULL DEFAULT 'UTC',
    "reminder_time" STRING,
    "quiet_start" STRING NOT NULL DEFAULT '22:00',
    "quiet_end" STRING NOT NULL DEFAULT '07:00',
    "recipe_prefs" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" STRING NOT NULL,
    "device_label" STRING,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "token_hash" STRING NOT NULL,
    "attempts" INT4 NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" STRING NOT NULL,
    "owner_id" UUID NOT NULL,
    "join_code" STRING NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "scoring" "Scoring" NOT NULL DEFAULT 'pct',
    "max_members" INT4 NOT NULL DEFAULT 20,
    "privacy" "Privacy" NOT NULL DEFAULT 'pct_only',
    "photos_visible" BOOL NOT NULL DEFAULT true,
    "status" "GroupStatus" NOT NULL DEFAULT 'active',
    "winner_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "baseline_kg" DECIMAL(5,1),
    "baseline_date" DATE,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "weigh_ins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "weight_kg" DECIMAL(5,1),
    "photo_key" STRING,
    "ate" BOOL,
    "moved" BOOL,
    "slept" BOOL,
    "intent" BOOL,
    "mood" INT2,
    "notes" STRING,
    "ai_read_weight" DECIMAL(65,30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "weigh_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "expo_token" STRING NOT NULL,
    "platform" STRING NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_prefs" (
    "user_id" UUID NOT NULL,
    "type" STRING NOT NULL,
    "push" BOOL NOT NULL DEFAULT true,
    "email" BOOL NOT NULL DEFAULT false,

    CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" STRING NOT NULL,
    "title" STRING NOT NULL,
    "body" STRING NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMPTZ,
    "sent_push_at" TIMESTAMPTZ,
    "sent_email_at" TIMESTAMPTZ,
    "dedupe_key" STRING NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_recipes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "craving" STRING NOT NULL,
    "recipe" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "feature" STRING NOT NULL,
    "model" STRING NOT NULL,
    "input_tokens" INT4 NOT NULL,
    "output_tokens" INT4 NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "latency_ms" INT4 NOT NULL,
    "status" STRING NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "email_tokens_token_hash_idx" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "groups_join_code_key" ON "groups"("join_code");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE INDEX "weigh_ins_user_id_entry_date_idx" ON "weigh_ins"("user_id", "entry_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "weigh_ins_user_id_entry_date_key" ON "weigh_ins"("user_id", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_expo_token_key" ON "push_tokens"("expo_token");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "saved_recipes_user_id_idx" ON "saved_recipes"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_feature_created_at_idx" ON "ai_usage"("user_id", "feature", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ins" ADD CONSTRAINT "weigh_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
