-- CreateTable
CREATE TABLE "price_rules" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "audience_type" TEXT NOT NULL,
    "audience_id" TEXT,
    "min_quantity" INTEGER,
    "amount_cents" INTEGER,
    "direction" TEXT,
    "mode" TEXT,
    "value" INTEGER,
    "floor_mode" TEXT,
    "floor_value" INTEGER,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),
    "label" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_rules_stage_idx" ON "price_rules"("stage");

-- CreateIndex
CREATE INDEX "price_rules_audience_id_idx" ON "price_rules"("audience_id");


-- ───────────────────────────────────────────────────────────────────────────
-- LA garantie de ce modèle. Deux règles également spécifiques valides au même
-- instant ne sont pas un cas à arbitrer : le prix dépendrait de l'ordre de tri,
-- donc du hasard, et deux passations identiques pourraient facturer deux
-- montants. On l'interdit EN BASE — un contrôle applicatif se contourne par une
-- insertion concurrente.
--
-- `coalesce` est indispensable : dans une contrainte d'exclusion, NULL n'entre
-- jamais en conflit avec NULL. Sans lui, deux règles globales / tous clients aux
-- fenêtres superposées passeraient — le cas le plus courant de tous.
--
-- Borne haute EXCLUE (`[)`) : deux règles qui se succèdent au même instant ne se
-- chevauchent pas, et personne n'a à se demander laquelle vaut à minuit pile.
--
-- `valid_*` sont en `timestamptz` : sans fuseau, `tstzrange()` dépendrait du
-- réglage de session, ne serait donc pas IMMUTABLE, et Postgres refuserait cette
-- contrainte.
-- ───────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_no_overlap"
  EXCLUDE USING gist (
    "stage" WITH =,
    "scope_type" WITH =,
    coalesce("scope_id", '') WITH =,
    "audience_type" WITH =,
    coalesce("audience_id", '') WITH =,
    coalesce("min_quantity", 0) WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  );
