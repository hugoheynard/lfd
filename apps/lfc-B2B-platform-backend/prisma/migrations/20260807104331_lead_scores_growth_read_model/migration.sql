-- CreateTable
CREATE TABLE "growth"."lead_scores" (
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "play" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "momentum" TEXT,
    "monetary_cents" INTEGER NOT NULL,
    "recency_days" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("subject_type","subject_id")
);

-- CreateIndex
CREATE INDEX "lead_scores_score_idx" ON "growth"."lead_scores"("score" DESC);
