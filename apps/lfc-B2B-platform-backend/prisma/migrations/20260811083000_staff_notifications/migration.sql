-- La cloche du back-office : socle générique (sujet, ligne, lien, lu/non-lu),
-- commun à l'équipe. Les alertes en sont le premier consommateur.
CREATE TABLE "staff_notifications" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "read_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_notifications_idempotency_key_key" ON "staff_notifications"("idempotency_key");
CREATE INDEX "staff_notifications_read_at_occurred_at_idx" ON "staff_notifications"("read_at", "occurred_at");
