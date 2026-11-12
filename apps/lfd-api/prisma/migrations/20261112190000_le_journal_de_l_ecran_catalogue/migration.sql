-- LE JOURNAL DE L'ÉCRAN CATALOGUE — plan
-- `documentation/caching-usage/plan-catalogue-du-back-office.md`, § 3.3.
--
-- Strictement ADDITIVE : une table neuve, une fonction, 15 déclencheurs (trois
-- par table surveillée). Aucune colonne existante touchée, aucune donnée
-- déplacée. `context_versions('catalog')` et ses déclencheurs ne changent pas.
--
-- Retour arrière : `DROP TRIGGER` des quinze déclencheurs, `DROP FUNCTION`
-- de la fonction, `DROP TABLE` du journal. Il ne perd que des numéros
-- d'affichage.
--
-- La forme est celle de `public.company_change` (migration
-- `20261112180000_les_journaux_des_comptes_et_des_commandes`), avec UN filtre
-- de plus : une mise à jour n'écrit une ligne que si une ligne a VRAIMENT
-- changé. Le projecteur du référentiel réécrit les articles à l'identique à
-- chaque rejeu ; sans ce filtre, chaque rejeu ferait relire l'écran Catalogue
-- à tous les onglets ouverts. Une insertion ou une suppression d'au moins une
-- ligne compte toujours. `TRUNCATE` ne déclenche rien.
--
-- Les cinq tables sont toutes dans `public` (`@@schema("public")`, vérifié le
-- 2026-11-12 dans `prisma/schema/public/catalog.prisma`) : aucun déclencheur
-- n'écrit d'un schéma à l'autre.

-- Les tables du catalogue sont écrites par le projecteur du référentiel : mieux
-- vaut que le déploiement échoue proprement en 5 s, et se relance, que de
-- faire attendre un rejeu derrière la pose d'un déclencheur.
SET lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE JOURNAL — en ajout seul ; le numéro est `max(id)` + `count(*)`
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."catalog_admin_change" (
    "id"          BIGSERIAL    NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "catalog_admin_change_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LA FONCTION — une ligne par instruction qui a VRAIMENT changé une ligne
-- ─────────────────────────────────────────────────────────────────────────────
-- Mise à jour : les lignes d'après moins les lignes d'avant, comparées
-- entières (`to_jsonb`). `EXCEPT ALL` compare au sens de `IS DISTINCT FROM`
-- (deux `NULL` sont égaux, un `NULL` face à une valeur diffère) et par
-- hachage, sans parcours croisé : un rejeu de tout le catalogue reste
-- linéaire. Une instruction qui réécrit chaque ligne à l'identique laisse la
-- différence vide, et n'écrit rien.
--
-- Un `INSERT … ON CONFLICT DO UPDATE` déclenche les deux : l'insertion ne voit
-- que les lignes créées, la mise à jour que les lignes en conflit.
CREATE OR REPLACE FUNCTION "public"."record_catalog_admin_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM old_rows) THEN
      INSERT INTO "public"."catalog_admin_change" DEFAULT VALUES;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM new_rows) THEN
      INSERT INTO "public"."catalog_admin_change" DEFAULT VALUES;
    END IF;
  ELSIF EXISTS (
    SELECT to_jsonb(n) FROM new_rows n
    EXCEPT ALL
    SELECT to_jsonb(o) FROM old_rows o
  ) THEN
    INSERT INTO "public"."catalog_admin_change" DEFAULT VALUES;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LES TABLES QUE L'ÉCRAN LIT
-- ─────────────────────────────────────────────────────────────────────────────
--   · `catalog_entries` — les fiches reçues (vue publiée) ;
--   · `catalog_items` — les articles en vente, leurs prix et leur attente ;
--   · `catalog_categories` — les rayons ;
--   · `catalog_item_overrides` — masquage, mise en avant, visibilité réservée ;
--   · `catalog_item_reservations` — les marqueurs du sur mesure.
CREATE TRIGGER "catalog_entries_catalog_admin_change_insert"
  AFTER INSERT ON "public"."catalog_entries"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_entries_catalog_admin_change_update"
  AFTER UPDATE ON "public"."catalog_entries"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_entries_catalog_admin_change_delete"
  AFTER DELETE ON "public"."catalog_entries"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_items_catalog_admin_change_insert"
  AFTER INSERT ON "public"."catalog_items"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_items_catalog_admin_change_update"
  AFTER UPDATE ON "public"."catalog_items"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_items_catalog_admin_change_delete"
  AFTER DELETE ON "public"."catalog_items"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_categories_catalog_admin_change_insert"
  AFTER INSERT ON "public"."catalog_categories"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_categories_catalog_admin_change_update"
  AFTER UPDATE ON "public"."catalog_categories"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_categories_catalog_admin_change_delete"
  AFTER DELETE ON "public"."catalog_categories"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_item_overrides_catalog_admin_change_insert"
  AFTER INSERT ON "public"."catalog_item_overrides"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_item_overrides_catalog_admin_change_update"
  AFTER UPDATE ON "public"."catalog_item_overrides"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_item_overrides_catalog_admin_change_delete"
  AFTER DELETE ON "public"."catalog_item_overrides"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_item_reservations_catalog_admin_change_insert"
  AFTER INSERT ON "public"."catalog_item_reservations"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_item_reservations_catalog_admin_change_update"
  AFTER UPDATE ON "public"."catalog_item_reservations"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
CREATE TRIGGER "catalog_item_reservations_catalog_admin_change_delete"
  AFTER DELETE ON "public"."catalog_item_reservations"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_catalog_admin_change"();
