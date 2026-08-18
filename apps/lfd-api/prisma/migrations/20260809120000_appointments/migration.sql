-- CreateTable
CREATE TABLE "growth"."availability_rules" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth"."availability_exceptions" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth"."appointments" (
    "id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "channel" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL DEFAULT '',
    "contact_phone" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "cancel_reason" TEXT NOT NULL DEFAULT '',
    "rescheduled_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_rules_weekday_idx" ON "growth"."availability_rules"("weekday");

-- CreateIndex
CREATE INDEX "availability_exceptions_day_idx" ON "growth"."availability_exceptions"("day");

-- CreateIndex
CREATE INDEX "appointments_start_at_idx" ON "growth"."appointments"("start_at");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "growth"."appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_subject_type_subject_id_idx" ON "growth"."appointments"("subject_type", "subject_id");

-- L'EXCLUSIVITÉ DU CRÉNEAU. Écrite à la main : Prisma ne sait pas modéliser un
-- index unique CONDITIONNEL, et cette garantie ne peut pas vivre dans le code
-- applicatif — deux requêtes concurrentes passeraient toutes deux la
-- vérification avant qu'une seule n'écrive. Un rendez-vous annulé libère son
-- créneau ; un rendez-vous actif le verrouille. La violation remonte en 409.
CREATE UNIQUE INDEX "appointments_slot_unique"
    ON "growth"."appointments"("start_at")
    WHERE "status" <> 'cancelled';

-- CreateTable
CREATE TABLE "growth"."booking_policy_settings" (
    "id" TEXT NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "lead_time_hours" INTEGER NOT NULL DEFAULT 24,
    "horizon_days" INTEGER NOT NULL DEFAULT 30,
    "channels" TEXT[] DEFAULT ARRAY['phone']::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_policy_settings_pkey" PRIMARY KEY ("id")
);
