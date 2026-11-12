-- LE JOURNAL DU RÉFÉRENTIEL — plan
-- `documentation/caching-usage/plan-lectures-du-pim.md`, § 4.1 et § 4.4.
--
-- Strictement ADDITIVE : une table neuve, une fonction, 72 déclencheurs (trois
-- par table surveillée). Aucune colonne existante touchée, aucune donnée
-- déplacée.
--
-- Retour arrière : `DROP TRIGGER` des déclencheurs `*_pim_change_*`,
-- `DROP FUNCTION "pim"."record_pim_change"()`, `DROP TABLE "pim"."pim_change"`.
-- Il ne perd que des numéros d'affichage.
--
-- La forme est celle de `public.company_change` : une ligne par instruction
-- qui touche AU MOINS une ligne, sans filtre de « vrai changement » — une
-- écriture Prisma du référentiel réécrit ses `@updatedAt` et remplace ses
-- enfants (`deleteMany` + `create`) à chaque enregistrement, un filtre n'y
-- retiendrait rien (§ 4.4). `TRUNCATE` ne déclenche rien.
--
-- Tout reste dans `pim` : les tables surveillées et le journal. Aucun
-- déclencheur n'écrit d'un schéma à l'autre.
--
-- La liste des tables est `PIM_VERSIONED_TABLES`
-- (`src/pim/changes/domain/pim-versioned-tables.ts`) ; un e2e vérifie qu'elle
-- et les déclencheurs posés ici disent la même chose.

-- Mieux vaut que le déploiement échoue proprement en 5 s, et se relance, que
-- de faire attendre un enregistrement de fiche derrière la pose d'un
-- déclencheur.
SET lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE JOURNAL — en ajout seul ; le numéro est `max(id)` + `count(*)`
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pim"."pim_change" (
    "id"          BIGSERIAL    NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "pim_change_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LA FONCTION — une ligne par instruction qui a touché au moins une ligne
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "pim"."record_pim_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM old_rows) THEN
      INSERT INTO "pim"."pim_change" DEFAULT VALUES;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM new_rows) THEN
    INSERT INTO "pim"."pim_change" DEFAULT VALUES;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LES TABLES QUE LISENT LA LISTE, LES RÉFÉRENTIELS ET LE DÉTAIL D'UNE FICHE
-- ─────────────────────────────────────────────────────────────────────────────
-- Hors numéro : les révisions et la réémission (leur propre écran), les
-- opérations, la liaison des canaux. Le détail d'une fiche ne lit pas
-- `catalog_revision_item` : sa filiation lit `product` et `product_variant`.
DO $$
DECLARE
  watched TEXT;
BEGIN
  FOREACH watched IN ARRAY ARRAY[
    'product', 'product_variant', 'product_editorial', 'product_media',
    'product_packaging', 'product_readiness', 'product_context_tva',
    'product_ingredient', 'variant_allergens', 'nutrition_declaration',
    'nutrition_values', 'category', 'category_editorial', 'category_media',
    'category_context_tva', 'tva_rate', 'sales_context', 'appellation',
    'ingredient', 'ingredient_allergen', 'allergen_category', 'allergen_entry',
    'order_time_limit', 'sku_registry'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT ON "pim".%I REFERENCING NEW TABLE AS new_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION "pim"."record_pim_change"()',
      watched || '_pim_change_insert', watched);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER UPDATE ON "pim".%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION "pim"."record_pim_change"()',
      watched || '_pim_change_update', watched);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON "pim".%I REFERENCING OLD TABLE AS old_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION "pim"."record_pim_change"()',
      watched || '_pim_change_delete', watched);
  END LOOP;
END;
$$;
