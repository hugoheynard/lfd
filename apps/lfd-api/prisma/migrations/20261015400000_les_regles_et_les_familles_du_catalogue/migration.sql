-- LES RÈGLES ET LES FAMILLES DU CATALOGUE — lot 2b de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md`.
--
-- Trois ajouts, tous écrits par les SEULS récepteurs des faits du référentiel
-- (`pim.catalog_category_changed`, `pim.catalog_product_changed`,
-- `pim.catalog_rules_changed`), qui ne reçoivent rien tant que
-- `CATALOG_FACTS_ENABLED` est fermé.
--
-- ADDITIF, et rien de servi ne change :
--   - `catalog_categories.withdrawn_at` / `audience` naissent `NULL` partout :
--     une famille archivée au référentiel pose une DATE, elle ne se supprime
--     jamais — `catalog_items.category_id` la référence en cascade, et la
--     supprimer emporterait ses articles et leurs décisions (§4 bis) ;
--   - `catalog_items.variant_id` naît `NULL` partout : l'identifiant de
--     déclinaison du référentiel, qu'une règle de limite de rang
--     « déclinaison » vise. Le push ne l'écrit pas ; les faits d'une fiche, si ;
--   - `catalog_rules` naît vide : l'échelle des limites de commande telle que
--     le dernier fait l'a apportée, sous son numéro (`applied_seq`). Tant
--     qu'elle est vide, les limites posées par le push restent intactes.
--
-- Retour arrière : `DROP TABLE "public"."catalog_rules"` et supprimer les
-- trois colonnes (aucun lecteur hors des récepteurs des faits).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_categories"
  ADD COLUMN "withdrawn_at" TIMESTAMP(3),
  ADD COLUMN "audience" TEXT,
  ADD CONSTRAINT "catalog_categories_audience_check" CHECK ("audience" IN ('pro', 'public', 'both'));

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "variant_id" TEXT;

CREATE TABLE "public"."catalog_rules" (
  "kind"        TEXT NOT NULL,
  "rules"       JSONB NOT NULL,
  "applied_seq" BIGINT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_rules_pkey" PRIMARY KEY ("kind"),
  CONSTRAINT "catalog_rules_kind_check" CHECK ("kind" IN ('order_time_limits'))
);
