-- LE RÉASSORT AU PLAN FIGÉ (lot R3a de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md, §13.3, Hugo
-- 2026-10-21).
--
-- 1. L'heure limite du réassort pour demain (« la veille, HH:MM », 20:00 par
--    défaut) remplace l'interrupteur `resupply_subject_to_cutoff`, qui reste en
--    base, ni lu ni écrit — à retirer dans un déploiement suivant.
-- 2. Le fournil fige, à l'arrêt du plan, les réassorts envoyés pour la
--    journée : deux tables dans SON schéma. `resupply_id` et `site_id` sont
--    opaques — aucune clé étrangère vers `public`.
--
-- ADDITIVE : une colonne NOT NULL avec défaut, deux tables neuves. Rien n'est
-- retiré ni renommé. Aucun droit n'est accordé.
--
-- Retour arrière du SCHÉMA : `DROP TABLE` des deux tables et `DROP COLUMN
-- "resupply_cutoff_time"` une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_cutoff_settings"
  ADD COLUMN "resupply_cutoff_time" VARCHAR(5) NOT NULL DEFAULT '20:00';

ALTER TABLE "public"."order_cutoff_settings"
  ADD CONSTRAINT "order_cutoff_settings_resupply_cutoff_time_clock" CHECK (
    "resupply_cutoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

CREATE TABLE "production"."production_resupply" (
    "id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "resupply_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "site_label" TEXT,

    CONSTRAINT "production_resupply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production"."production_resupply_line" (
    "id" TEXT NOT NULL,
    "production_resupply_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "production_resupply_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_resupply_line_quantity_positive" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "production_resupply_service_day_resupply_id_key"
  ON "production"."production_resupply"("service_day", "resupply_id");

CREATE INDEX "production_resupply_line_production_resupply_id_idx"
  ON "production"."production_resupply_line"("production_resupply_id");

ALTER TABLE "production"."production_resupply"
  ADD CONSTRAINT "production_resupply_service_day_fkey" FOREIGN KEY ("service_day")
  REFERENCES "production"."production_day"("service_day") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production"."production_resupply_line"
  ADD CONSTRAINT "production_resupply_line_production_resupply_id_fkey"
  FOREIGN KEY ("production_resupply_id")
  REFERENCES "production"."production_resupply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
