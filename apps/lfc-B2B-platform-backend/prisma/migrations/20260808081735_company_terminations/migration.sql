-- CreateTable
CREATE TABLE "growth"."company_terminations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_terminations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_terminations_outcome_reason_idx" ON "growth"."company_terminations"("outcome", "reason");
