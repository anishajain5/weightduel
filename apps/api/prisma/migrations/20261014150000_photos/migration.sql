SET create_table_with_schema_locked = false;


-- CreateTable
CREATE TABLE "photos" (
    "key" STRING NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" STRING NOT NULL,
    "size" INT4 NOT NULL,
    "bytes" BYTES NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "photos_user_id_idx" ON "photos"("user_id");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

