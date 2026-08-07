-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "growth";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_fkey";

-- CreateTable
CREATE TABLE "growth"."activity_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "establishment_id" TEXT,
    "actor_type" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_events_idempotency_key_key" ON "growth"."activity_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "activity_events_subject_type_subject_id_occurred_at_idx" ON "growth"."activity_events"("subject_type", "subject_id", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_events_type_occurred_at_idx" ON "growth"."activity_events"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_events_establishment_id_occurred_at_idx" ON "growth"."activity_events"("establishment_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
