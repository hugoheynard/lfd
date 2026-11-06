-- LES VERSIONS PAR CONTEXTE — plan
-- `documentation/caching-usage/plan-materiaux-du-catalogue.md`, § 2.2, § 11, lot M1a.
--
-- Strictement additive : une table neuve de trois lignes, trois fonctions,
-- huit déclencheurs. Aucune colonne existante touchée, aucune donnée copiée.
-- RIEN NE LA LIT encore (M1b posera l'instantané qui la lit).
--
-- Retour arrière, dans cet ordre : `DROP TRIGGER` des huit déclencheurs
-- `*_context_version`, `DROP FUNCTION` de `catalog_version_bump()`,
-- `operations_version_bump()` et `order_cutoffs_version_bump()`, puis
-- `DROP TABLE "public"."context_versions"`. Gratuit tant que M1b n'est pas
-- déployé : aucun binaire ne la lit.
--
-- UN NUMÉRO PAR CONTEXTE (Hugo, 2026-11-06) : `catalog` (b2b/catalog),
-- `operations` (b2b/operations), `order_cutoffs` (b2b/order-cutoffs) — les
-- propriétaires de `lint:prisma-model-ownership`. Chaque déclencheur appelle la
-- fonction de SON contexte, qui n'écrit que SA ligne : masquer une opération ne
-- fait pas relire les articles.
--
-- Une fonction par contexte plutôt qu'une générique à argument (`TG_ARGV`) :
-- un nom de fonction mal écrit échoue ICI, à la migration ; un argument mal
-- orthographié n'échouerait qu'au `CHECK`, à la première écriture en
-- production (`vitruve`, 2026-11-06).
--
-- Même mécanique que `principal_stamp`, dans sa forme en service
-- (`20261104120000_l_estampille_du_principal`, resserrée par
-- `20261105120000_l_estampille_filtree_par_colonnes`) :
--
-- 🔴 Un COMPTEUR, pas un `max(id)` : un `max(id)` est attribué à l'écriture,
-- pas à la validation. Le verrou de la ligne aligne l'ordre des validations
-- sur l'ordre des numéros.
--
-- 🔴 `BEFORE … FOR EACH STATEMENT`, pas `AFTER` : le verrou de la ligne du
-- contexte est pris AVANT ceux des lignes écrites.
--
-- 🔴 `UPDATE OF` ne retient que les colonnes que l'instantané lira
-- (`src/b2b/catalog/infrastructure/catalogue-snapshot-columns.ts`, rangée par
-- contexte) ; `INSERT` et `DELETE` font toujours monter. La porte
-- `lint:context-version-columns` confronte ces listes, et la fonction appelée,
-- à la constante et au registre `catalogue-snapshot-registry.json`.
--
-- ⚠️ `UPDATE OF` monte dès que la colonne figure dans le `SET`, même à valeur
-- égale. Une instruction qui ne touche aucune ligne fait monter aussi. Plus
-- large que nécessaire, jamais trop étroit. `TRUNCATE` ne déclenche rien.
--
-- ⚠️ Ordre des verrous entre deux lignes (ou avec `principal_stamp`) : aucune
-- transaction n'écrit deux contextes aujourd'hui (constaté le 2026-11-06, non
-- tenu par un mécanisme). Si cela arrivait dans les deux ordres, Postgres
-- détecte l'interblocage et annule une des deux transactions.
--
-- `catalog_operation_overrides` n'a PAS de déclencheur : personne ne la lit
-- (plan, § 9).

-- Ces tables sont lues à chaque devis : mieux vaut que le déploiement échoue
-- proprement en 5 s — il se relance — que de les bloquer.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."context_versions" (
    "context" TEXT   NOT NULL,
    "value"   BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "context_versions_pkey" PRIMARY KEY ("context"),
    CONSTRAINT "context_versions_known_context"
      CHECK ("context" IN ('catalog', 'operations', 'order_cutoffs'))
);

INSERT INTO "public"."context_versions" ("context", "value")
VALUES ('catalog', 0), ('operations', 0), ('order_cutoffs', 0)
ON CONFLICT ("context") DO NOTHING;

-- Une ligne absente (une base vidée à la main) est RECRÉÉE plutôt qu'ignorée :
-- un `UPDATE` sur zéro ligne laisserait passer l'écriture sans faire monter le
-- numéro, et un morceau périmé resterait servi. Conséquence : « ligne absente »
-- n'est PAS un arrêt d'urgence — la première écriture la recrée. L'arrêt de la
-- mémoire est un réglage (plan, § 2.2).

CREATE OR REPLACE FUNCTION "public"."catalog_version_bump"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "public"."context_versions" ("context", "value") VALUES ('catalog', 1)
  ON CONFLICT ("context") DO UPDATE SET "value" = "context_versions"."value" + 1;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "public"."operations_version_bump"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "public"."context_versions" ("context", "value") VALUES ('operations', 1)
  ON CONFLICT ("context") DO UPDATE SET "value" = "context_versions"."value" + 1;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "public"."order_cutoffs_version_bump"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "public"."context_versions" ("context", "value") VALUES ('order_cutoffs', 1)
  ON CONFLICT ("context") DO UPDATE SET "value" = "context_versions"."value" + 1;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "catalog_items_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "sku", "product_id", "product_sku", "name", "category_id", "price_millicents", "is_default", "position", "vat_rate_percent", "pro_price_per_kg_millicents", "public_price_per_kg_ttc_cents", "sale_unit", "weight_min_grams", "weight_step_grams", "pro_min_quantity", "public_min_quantity", "public_by_context", "allergens", "allergen_labels", "allergens_precautionary", "allergen_texts", "note", "name_translations", "note_translations", "image_url", "image_alt", "image_width", "image_height", "image_focal_x", "image_focal_y", "thumbnail_url", "thumbnail_alt", "thumbnail_width", "thumbnail_height", "thumbnail_focal_x", "thumbnail_focal_y", "order_limit_days_before", "order_limit_time", "order_limit_grace_minutes", "withdrawn_at", "operation_only", "variants_as_tiles", "product_name", "custom_recipe", "detached_from_sku", "detached_from_variant_sku", "audience", "public_review_pending", "pro_review_pending"
  ON "public"."catalog_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();

CREATE TRIGGER "catalog_categories_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "id", "name", "name_translations", "slug", "parent_id", "position"
  ON "public"."catalog_categories"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();

CREATE TRIGGER "catalog_item_overrides_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "sku", "is_hidden", "is_hidden_public", "is_featured_pro", "is_featured_public", "reserved_visibility"
  ON "public"."catalog_item_overrides"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();

CREATE TRIGGER "catalog_item_reservations_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "sku", "company_id"
  ON "public"."catalog_item_reservations"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();

CREATE TRIGGER "catalog_operations_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "key", "name", "lede", "image_url", "image_alt", "image_focal_x", "image_focal_y", "announce_from", "order_from", "order_until", "pickup_from", "pickup_until", "shows_order_until_time", "audience", "received_at", "withdrawn_at", "hidden"
  ON "public"."catalog_operations"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."operations_version_bump"();

CREATE TRIGGER "catalog_operation_items_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "operation_key", "sku", "position"
  ON "public"."catalog_operation_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."operations_version_bump"();

CREATE TRIGGER "order_cutoffs_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "id", "pickup_address_id", "weekday", "days_before", "time", "grace_minutes"
  ON "public"."order_cutoffs"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."order_cutoffs_version_bump"();

CREATE TRIGGER "order_cutoff_settings_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "key", "same_day_public_allowed", "same_day_pro_allowed", "same_day_pro_online", "same_day_pro_without_credit"
  ON "public"."order_cutoff_settings"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."order_cutoffs_version_bump"();
