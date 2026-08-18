-- Dérogations par échéance d'un panier récurrent (« modifier cette commande uniquement »).
CREATE TABLE "subscription_occurrences" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "occurrence_date" DATE NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_occurrences_subscription_id_idx" ON "subscription_occurrences"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_occurrences_subscription_id_occurrence_date_key" ON "subscription_occurrences"("subscription_id", "occurrence_date");

-- AddForeignKey
ALTER TABLE "subscription_occurrences" ADD CONSTRAINT "subscription_occurrences_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
