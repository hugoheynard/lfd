-- LE SUR MESURE AU RÉFÉRENTIEL — lot R3-1 de
-- `documentation/catalogue/plan-articles-sur-mesure.md` (§ 13).
--
-- « Sur mesure » devient un fait de la FICHE (D1) : saisi au référentiel,
-- descendu sur chaque article par le fil (v17). Il quitte le commerce, où il
-- vivait en `catalog_item_overrides.is_made_to_order` — colonne qui devient
-- MORTE (plus aucun code ne la lit ni ne l'écrit) et qui reste en base.
--
-- ADDITIF : deux colonnes nées `false`, puis le REPORT de l'ancien marqueur.
--
-- 🔴 Le report est le SEUL endroit du dépôt qui lit les deux schémas
-- (`public` × `pim`), par `catalog_items.product_id`. C'est une migration, pas
-- du code servi : la jointure n'est admise qu'ici (13.6, BLOQUANT 3), et
-- `lint:cross-schema-join` ne lit pas les migrations.
--
-- Règle du report (13.3, acceptée par Hugo le 2026-11-02, 13.7) : une fiche
-- devient sur mesure EN ENTIER dès qu'UNE de ses déclinaisons portait le
-- marqueur ; toutes ses déclinaisons au commerce aussi. Une fiche absente du
-- référentiel (article orphelin) n'est pas touchée côté `pim`, et ses
-- articles le sont quand même côté commerce.
--
-- Compter avant (lecture seule) les fiches dont une partie seulement des
-- déclinaisons était marquée :
--
--   SELECT ci.product_id,
--          count(*) FILTER (WHERE o.is_made_to_order) AS marquees,
--          count(*) AS declinaisons
--     FROM public.catalog_items ci
--     LEFT JOIN public.catalog_item_overrides o ON o.sku = ci.sku
--    GROUP BY ci.product_id
--   HAVING bool_or(coalesce(o.is_made_to_order, false))
--      AND NOT bool_and(coalesce(o.is_made_to_order, false));
--
-- Ordre de déploiement (13.6-4) : cette migration → le code R3-1 → une
-- réémission complète du catalogue (`POST /pim/channels/b2b/reemit`). Un fait émis
-- avant le code ne porte pas `customRecipe` et laisse la colonne commerce
-- intacte ; la réémission relit `true` depuis la fiche.
--
-- Retour arrière : `prisma/rollback/20261102240000_le_sur_mesure_au_referentiel.sql`.

SET lock_timeout = '5s';

ALTER TABLE "pim"."product"
  ADD COLUMN "custom_recipe" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "custom_recipe" BOOLEAN NOT NULL DEFAULT false;

-- Les fiches dont au moins une déclinaison était marquée au commerce.
WITH marked AS (
  SELECT DISTINCT ci.product_id
    FROM "public"."catalog_items" ci
    JOIN "public"."catalog_item_overrides" o ON o.sku = ci.sku
   WHERE o.is_made_to_order = true
)
UPDATE "pim"."product" p
   SET "custom_recipe" = true
  FROM marked
 WHERE p.id = marked.product_id;

-- Tous les articles de ces fiches, au commerce.
WITH marked AS (
  SELECT DISTINCT ci.product_id
    FROM "public"."catalog_items" ci
    JOIN "public"."catalog_item_overrides" o ON o.sku = ci.sku
   WHERE o.is_made_to_order = true
)
UPDATE "public"."catalog_items" ci
   SET "custom_recipe" = true
  FROM marked
 WHERE ci.product_id = marked.product_id;
