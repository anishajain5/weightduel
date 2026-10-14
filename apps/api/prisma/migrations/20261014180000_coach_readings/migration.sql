SET create_table_with_schema_locked = false;

-- CreateTable
CREATE TABLE "coach_readings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "data_hash" STRING NOT NULL,
    "text" STRING NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_readings_user_id_created_at_idx" ON "coach_readings"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "coach_readings" ADD CONSTRAINT "coach_readings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

