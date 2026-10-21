-- Le réassort commandé par un point de retrait (lot R1 de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md, §12, Hugo
-- 2026-10-21) : l'agrégat `SiteResupply`, jamais une commande — aucun prix,
-- aucune TVA, aucune clé vers `orders`.
--
-- ADDITIVE : deux tables neuves. Rien n'est retiré ni resserré. Aucun droit
-- n'est accordé : les routes vivent sous `handover_counter` (comptoir) et
-- `production_worksheet` / `production_plan` (fournil), qui existent déjà.

CREATE TABLE "public"."site_resupply" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "service_day" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "placed_at" TIMESTAMP(3) NOT NULL,
    "placed_by_staff_id" TEXT NOT NULL,
    "placed_by_name" TEXT NOT NULL,
    "placed_by_role" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_staff_id" TEXT,
    "cancelled_by_name" TEXT,
    "cancelled_by_role" TEXT,

    CONSTRAINT "site_resupply_pkey" PRIMARY KEY ("id"),
    -- Les deux visées de l'agrégat, et rien d'autre.
    CONSTRAINT "site_resupply_target_known" CHECK ("target" IN ('tomorrow', 'asap')),
    -- Une annulation est entière : l'instant et l'auteur ensemble, ou rien.
    CONSTRAINT "site_resupply_cancellation_whole" CHECK (
      ("cancelled_at" IS NULL AND "cancelled_by_staff_id" IS NULL
        AND "cancelled_by_name" IS NULL AND "cancelled_by_role" IS NULL)
      OR ("cancelled_at" IS NOT NULL AND "cancelled_by_staff_id" IS NOT NULL
        AND "cancelled_by_name" IS NOT NULL AND "cancelled_by_role" IS NOT NULL)
    )
);

CREATE TABLE "public"."site_resupply_line" (
    "id" TEXT NOT NULL,
    "resupply_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "site_resupply_line_pkey" PRIMARY KEY ("id"),
    -- Le second barreau de l'agrégat : une quantité demandée est au moins 1.
    CONSTRAINT "site_resupply_line_quantity_positive" CHECK ("quantity" > 0)
);

CREATE INDEX "site_resupply_service_day_site_id_idx" ON "public"."site_resupply"("service_day", "site_id");

CREATE UNIQUE INDEX "site_resupply_line_resupply_id_sku_key" ON "public"."site_resupply_line"("resupply_id", "sku");

ALTER TABLE "public"."site_resupply_line" ADD CONSTRAINT "site_resupply_line_resupply_id_fkey" FOREIGN KEY ("resupply_id") REFERENCES "public"."site_resupply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
