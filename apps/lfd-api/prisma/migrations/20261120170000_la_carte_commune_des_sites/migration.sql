-- ───────────────────────────────────────────────────────────────────────────
-- LA CARTE COMMUNE DES SITES — une carte par principal, pour tous ses sites.
--
-- `documentation/comptes-client/carte-des-sites.md`, § 6 (lot K1). Additive :
-- deux tables neuves, de la forme de `sub_account_menu`, et une colonne
-- `state` à défaut `own` sur `sub_account_menu` — toute carte déjà posée
-- reste la carte propre de son site, comme aujourd'hui. Aucune ligne semée,
-- aucun droit accordé à un rôle.
--
-- Les CHECK tiennent les mêmes valeurs que ceux de `sub_account_menu`.
-- Les clés étrangères sont en RESTRICT : une carte ne disparaît pas avec sa
-- société, elle dort. La carte entre au journal des comptes
-- (`company_change`), comme celle d'un site.
--
-- Retour arrière : `prisma/rollback/20261120170000_la_carte_commune_des_sites.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

ALTER TABLE "public"."sub_account_menu"
  ADD COLUMN "state" TEXT NOT NULL DEFAULT 'own',
  ADD CONSTRAINT "sub_account_menu_state_known" CHECK ("state" IN ('own', 'follows_common'));

CREATE TABLE "public"."principal_sites_menu" (
    "company_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "off_menu" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_staff_id" TEXT,
    "updated_by_user_id" TEXT,

    CONSTRAINT "principal_sites_menu_pkey" PRIMARY KEY ("company_id"),
    CONSTRAINT "principal_sites_menu_mode_known" CHECK ("mode" IN ('only', 'except')),
    CONSTRAINT "principal_sites_menu_off_menu_known" CHECK ("off_menu" IN ('hidden', 'visible_locked')),
    CONSTRAINT "principal_sites_menu_one_author" CHECK (
      ("updated_by_staff_id" IS NULL) <> ("updated_by_user_id" IS NULL)
    )
);

CREATE TABLE "public"."principal_sites_menu_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "effect" TEXT NOT NULL,

    CONSTRAINT "principal_sites_menu_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "principal_sites_menu_entry_level_known" CHECK ("level" IN ('family', 'product', 'sku')),
    CONSTRAINT "principal_sites_menu_entry_effect_known" CHECK ("effect" IN ('include', 'exclude')),
    CONSTRAINT "principal_sites_menu_entry_ref_present" CHECK (length(btrim("ref")) > 0)
);

CREATE UNIQUE INDEX "principal_sites_menu_entry_company_id_level_ref_key"
  ON "public"."principal_sites_menu_entry"("company_id", "level", "ref");

ALTER TABLE "public"."principal_sites_menu"
  ADD CONSTRAINT "principal_sites_menu_company_id_fkey" FOREIGN KEY ("company_id")
  REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."principal_sites_menu_entry"
  ADD CONSTRAINT "principal_sites_menu_entry_company_id_fkey" FOREIGN KEY ("company_id")
  REFERENCES "public"."principal_sites_menu"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le journal des comptes : trois déclencheurs d'instruction par table.
CREATE TRIGGER "principal_sites_menu_company_change_insert"
  AFTER INSERT ON "public"."principal_sites_menu"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "principal_sites_menu_company_change_update"
  AFTER UPDATE ON "public"."principal_sites_menu"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "principal_sites_menu_company_change_delete"
  AFTER DELETE ON "public"."principal_sites_menu"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "principal_sites_menu_entry_company_change_insert"
  AFTER INSERT ON "public"."principal_sites_menu_entry"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "principal_sites_menu_entry_company_change_update"
  AFTER UPDATE ON "public"."principal_sites_menu_entry"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "principal_sites_menu_entry_company_change_delete"
  AFTER DELETE ON "public"."principal_sites_menu_entry"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
