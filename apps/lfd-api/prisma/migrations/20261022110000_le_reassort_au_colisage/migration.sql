-- LE RÉASSORT AU COLISAGE (lot R3b de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md, §13.1 point 5,
-- §13.3, §13.4 — Hugo 2026-10-21).
--
-- 1. Le fournil fige, à l'arrêt, si le point du réassort est servi par un
--    transfert interne (`supply = transfer`) : seul un tel réassort a une fiche
--    au colisage. `false` pour les réassorts figés avant cette colonne.
-- 2. Le colisage tient sa fiche de réassort, À PART de `packing_order` : deux
--    tables dans SON schéma. `resupply_id` et `site_id` sont opaques — aucune
--    clé étrangère vers `public` ni vers `production`.
--
-- ADDITIVE : une colonne NOT NULL avec défaut, deux tables neuves. Rien n'est
-- retiré ni renommé. Aucun droit n'est accordé : le poste reste sous
-- `production_packing`.
--
-- Retour arrière du SCHÉMA : `DROP TABLE` des deux tables du colisage et
-- `DROP COLUMN "served_by_transfer"` une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_resupply"
  ADD COLUMN "served_by_transfer" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "packing"."packing_resupply" (
    "service_day" VARCHAR(10) NOT NULL,
    "resupply_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "site_label" TEXT,
    "drawn_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" TEXT,

    CONSTRAINT "packing_resupply_pkey" PRIMARY KEY ("service_day","resupply_id"),
    -- La clôture : l'instant et l'auteur, ensemble ou aucun.
    CONSTRAINT "packing_resupply_closed_together" CHECK (
      ("closed_at" IS NULL) = ("closed_by" IS NULL)
    )
);

CREATE INDEX "packing_resupply_resupply_id_idx" ON "packing"."packing_resupply"("resupply_id");

CREATE TABLE "packing"."packing_resupply_line" (
    "service_day" VARCHAR(10) NOT NULL,
    "resupply_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "packed" INTEGER,
    "packed_at" TIMESTAMPTZ(6),
    "packed_by" TEXT,

    CONSTRAINT "packing_resupply_line_pkey" PRIMARY KEY ("service_day","resupply_id","sku"),
    CONSTRAINT "packing_resupply_line_quantity_positive" CHECK ("quantity" > 0),
    -- L'emballé : 0 ≤ emballé ≤ demandé (0 permis : rien n'est parti).
    CONSTRAINT "packing_resupply_line_packed_bounded" CHECK (
      "packed" IS NULL OR ("packed" >= 0 AND "packed" <= "quantity")
    ),
    -- La saisie : quantité, instant et auteur, ensemble ou aucun.
    CONSTRAINT "packing_resupply_line_packed_together" CHECK (
      ("packed" IS NULL) = ("packed_at" IS NULL) AND ("packed" IS NULL) = ("packed_by" IS NULL)
    )
);

ALTER TABLE "packing"."packing_resupply_line"
  ADD CONSTRAINT "packing_resupply_line_service_day_resupply_id_fkey"
  FOREIGN KEY ("service_day", "resupply_id")
  REFERENCES "packing"."packing_resupply"("service_day", "resupply_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
