-- Le suivi du stock au comptoir, réglé point par point (Réglages › Comptoir,
-- décidé par Hugo le 2026-11-19 ; reassort-boutiques/reception-et-stock.md § 5).
--
-- ADDITIVE : une table neuve. Rien n'est écrit dans une table existante, aucun
-- droit n'est accordé. L'absence de ligne vaut « suivi désactivé ».

SET lock_timeout = '5s';

CREATE TABLE "public"."counter_stock_settings" (
    "site_id" TEXT NOT NULL,
    "stock_tracking" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "counter_stock_settings_pkey" PRIMARY KEY ("site_id")
);
