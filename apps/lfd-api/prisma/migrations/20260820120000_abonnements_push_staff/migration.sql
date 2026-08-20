-- Abonnements Web Push du back-office : une ligne par installation (navigateur
-- + appareil), identifiée par l'URL de son service de push.
CREATE TABLE "public"."staff_push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "staff_sub" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMP(3),

    CONSTRAINT "staff_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Un navigateur qui se réabonne REMPLACE son abonnement, il n'en accumule pas.
CREATE UNIQUE INDEX "staff_push_subscriptions_endpoint_key" ON "public"."staff_push_subscriptions"("endpoint");

CREATE INDEX "staff_push_subscriptions_staff_sub_idx" ON "public"."staff_push_subscriptions"("staff_sub");
