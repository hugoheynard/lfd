-- La réception du réapprovisionnement d'un site (lot J1 du plan
-- documentation/limites-de-commande/plan-jour-meme-sur-stock.md ; modèle B de
-- documentation/livraisons/transferts/plan-reapprovisionnement.md, Hugo
-- 2026-10-21) et la limite du réapprovisionnement dans les réglages.
--
-- ADDITIVE : deux tables neuves, une colonne neuve à défaut. Rien n'est retiré
-- ni resserré.

ALTER TABLE "public"."order_cutoff_settings"
  ADD COLUMN "resupply_subject_to_cutoff" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "public"."resupply_receipt" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "service_day" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "resupply_receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."resupply_receipt_line" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "resupply_receipt_line_pkey" PRIMARY KEY ("id"),
    -- Le second barreau de l'agrégat : une quantité reçue n'est jamais négative.
    CONSTRAINT "resupply_receipt_line_quantity_non_negative" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX "resupply_receipt_site_id_service_day_key" ON "public"."resupply_receipt"("site_id", "service_day");

CREATE INDEX "resupply_receipt_line_receipt_id_idx" ON "public"."resupply_receipt_line"("receipt_id");

CREATE UNIQUE INDEX "resupply_receipt_line_receipt_id_sku_key" ON "public"."resupply_receipt_line"("receipt_id", "sku");

ALTER TABLE "public"."resupply_receipt_line" ADD CONSTRAINT "resupply_receipt_line_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."resupply_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
