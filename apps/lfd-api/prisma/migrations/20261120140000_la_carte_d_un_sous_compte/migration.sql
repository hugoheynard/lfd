-- ───────────────────────────────────────────────────────────────────────────
-- LA CARTE D'UN SOUS-COMPTE — ce que ses sites peuvent commander.
--
-- Plan documentation/comptes-client/plan-carte-des-sites.md, § 3.3 et § 4
-- (lot C1). Additive : deux tables neuves, aucune ligne semée — sans carte,
-- un sous-compte commande ce que son rayon lui sert, comme aujourd'hui.
-- Aucun droit n'est accordé à un rôle.
--
-- Les CHECK tiennent les valeurs que l'agrégat `SubAccountMenu` écrit ; un
-- auteur est le staff OU un utilisateur du principal, jamais les deux ni
-- aucun. Les clés étrangères sont en RESTRICT : une carte ne disparaît pas
-- avec sa société, elle dort.
--
-- La carte entre au journal des comptes (`company_change`) : la fiche staff
-- d'un sous-compte la montrera, et son numéro doit monter quand elle change.
--
-- Retour arrière : `prisma/rollback/20261120140000_la_carte_d_un_sous_compte.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TABLE "public"."sub_account_menu" (
    "company_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "off_menu" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_staff_id" TEXT,
    "updated_by_user_id" TEXT,

    CONSTRAINT "sub_account_menu_pkey" PRIMARY KEY ("company_id"),
    CONSTRAINT "sub_account_menu_mode_known" CHECK ("mode" IN ('only', 'except')),
    CONSTRAINT "sub_account_menu_off_menu_known" CHECK ("off_menu" IN ('hidden', 'visible_locked')),
    CONSTRAINT "sub_account_menu_one_author" CHECK (
      ("updated_by_staff_id" IS NULL) <> ("updated_by_user_id" IS NULL)
    )
);

CREATE TABLE "public"."sub_account_menu_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "effect" TEXT NOT NULL,

    CONSTRAINT "sub_account_menu_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sub_account_menu_entry_level_known" CHECK ("level" IN ('family', 'product', 'sku')),
    CONSTRAINT "sub_account_menu_entry_effect_known" CHECK ("effect" IN ('include', 'exclude')),
    CONSTRAINT "sub_account_menu_entry_ref_present" CHECK (length(btrim("ref")) > 0)
);

CREATE UNIQUE INDEX "sub_account_menu_entry_company_id_level_ref_key"
  ON "public"."sub_account_menu_entry"("company_id", "level", "ref");

ALTER TABLE "public"."sub_account_menu"
  ADD CONSTRAINT "sub_account_menu_company_id_fkey" FOREIGN KEY ("company_id")
  REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sub_account_menu_entry"
  ADD CONSTRAINT "sub_account_menu_entry_company_id_fkey" FOREIGN KEY ("company_id")
  REFERENCES "public"."sub_account_menu"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le journal des comptes : trois déclencheurs d'instruction par table.
CREATE TRIGGER "sub_account_menu_company_change_insert"
  AFTER INSERT ON "public"."sub_account_menu"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "sub_account_menu_company_change_update"
  AFTER UPDATE ON "public"."sub_account_menu"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "sub_account_menu_company_change_delete"
  AFTER DELETE ON "public"."sub_account_menu"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "sub_account_menu_entry_company_change_insert"
  AFTER INSERT ON "public"."sub_account_menu_entry"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "sub_account_menu_entry_company_change_update"
  AFTER UPDATE ON "public"."sub_account_menu_entry"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "sub_account_menu_entry_company_change_delete"
  AFTER DELETE ON "public"."sub_account_menu_entry"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
