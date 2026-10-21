-- Rupture et stock faible au comptoir (lot R1b de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md, Hugo
-- 2026-10-21) : l'agrégat `StockAlert`, une alerte déclarée par un point sur
-- un article, levée à la main ou par la réception d'un réassort.
--
-- ADDITIVE : une table neuve. Rien n'est retiré ni resserré. Aucun droit
-- n'est accordé : les routes vivent sous `handover_counter` (comptoir) et
-- `production_worksheet` / `production_plan` (fournil), qui existent déjà.

CREATE TABLE "public"."site_stock_alert" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "declared_at" TIMESTAMP(3) NOT NULL,
    "declared_by_staff_id" TEXT NOT NULL,
    "declared_by_name" TEXT NOT NULL,
    "declared_by_role" TEXT NOT NULL,
    "lifted_at" TIMESTAMP(3),
    "lifted_by_staff_id" TEXT,
    "lifted_by_name" TEXT,
    "lifted_by_role" TEXT,
    "lift_reason" TEXT,

    CONSTRAINT "site_stock_alert_pkey" PRIMARY KEY ("id"),
    -- Les deux niveaux de l'agrégat, et rien d'autre.
    CONSTRAINT "site_stock_alert_level_known" CHECK ("level" IN ('out_of_stock', 'low')),
    -- Une levée est entière : instant, auteur et raison ensemble, ou rien.
    CONSTRAINT "site_stock_alert_lift_whole" CHECK (
      ("lifted_at" IS NULL AND "lifted_by_staff_id" IS NULL AND "lifted_by_name" IS NULL
        AND "lifted_by_role" IS NULL AND "lift_reason" IS NULL)
      OR ("lifted_at" IS NOT NULL AND "lifted_by_staff_id" IS NOT NULL
        AND "lifted_by_name" IS NOT NULL AND "lifted_by_role" IS NOT NULL
        AND "lift_reason" IN ('manual', 'receipt'))
    )
);

CREATE INDEX "site_stock_alert_site_id_lifted_at_idx" ON "public"."site_stock_alert"("site_id", "lifted_at");

-- Une seule alerte vivante par (point, article) : deux postes qui déclarent
-- en même temps, le second est refusé plutôt que d'ouvrir un doublon.
CREATE UNIQUE INDEX "site_stock_alert_live_site_sku_key" ON "public"."site_stock_alert"("site_id", "sku") WHERE "lifted_at" IS NULL;
