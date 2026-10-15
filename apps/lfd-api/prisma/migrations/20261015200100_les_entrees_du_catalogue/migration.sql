-- LES ENTRÉES DU CATALOGUE — lot 2a de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md` (décision de
-- forme du lot 2, 2a4, 2a5).
--
-- `catalog_items` reste la table de ce qui SE VEND : onze lecteurs la lisent
-- comme telle et un prix n'y est jamais nul. Ce qui manquait — une fiche
-- inactive, une déclinaison incomplète, l'audience — va dans une table neuve,
-- par FICHE, que les faits du référentiel tiennent à jour.
--
-- ADDITIF, et rien de servi ne change :
--   - `catalog_entries` naît vide ; seul le récepteur des faits l'écrit, et il
--     ne reçoit rien tant que `CATALOG_FACTS_ENABLED` est fermé ;
--   - `catalog_categories.applied_seq` naît `NULL` partout (« jamais reçue
--     par un fait ») ;
--   - `catalog_items.audience` naît `NULL` partout, lu `both` : c'est ce que
--     fait tout article aujourd'hui.
--
-- `category_id` SANS clé étrangère : un fait fiche peut arriver avant le fait
-- de sa famille (deux abonnés, aucun ordre entre eux), et une entrée ne doit
-- jamais emporter ni bloquer une famille.
--
-- Retour arrière : `DROP TABLE "public"."catalog_entries"`, et supprimer les
-- deux colonnes ajoutées (aucun lecteur hors du récepteur et de `servedTo`).

SET lock_timeout = '5s';

CREATE TABLE "public"."catalog_entries" (
  "product_id"  TEXT NOT NULL,
  "product_sku" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "status"      TEXT NOT NULL,
  "audience"    TEXT NOT NULL,
  "gaps"        JSONB NOT NULL,
  "applied_seq" BIGINT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_entries_pkey" PRIMARY KEY ("product_id"),
  CONSTRAINT "catalog_entries_status_check" CHECK ("status" IN ('inactive', 'active', 'archived')),
  CONSTRAINT "catalog_entries_audience_check" CHECK ("audience" IN ('pro', 'public', 'both'))
);

CREATE INDEX "catalog_entries_category_id_idx" ON "public"."catalog_entries" ("category_id");

ALTER TABLE "public"."catalog_categories"
  ADD COLUMN "applied_seq" BIGINT;

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "audience" TEXT,
  ADD CONSTRAINT "catalog_items_audience_check" CHECK ("audience" IN ('pro', 'public', 'both'));
