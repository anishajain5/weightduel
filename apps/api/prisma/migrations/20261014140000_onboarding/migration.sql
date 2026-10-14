SET create_table_with_schema_locked = false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboarded_at" TIMESTAMPTZ;
