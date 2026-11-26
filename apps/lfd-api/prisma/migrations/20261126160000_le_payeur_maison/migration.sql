-- LA NATURE « MAISON » D'UN PAYEUR — `public.payer_in_house`.
-- (documentation/comptabilite/facturation/plan-restaurants-maison.md, D1,
-- lot L1).
--
-- ADDITIVE : une table neuve, vide, et les trois déclencheurs qui la font
-- compter dans le journal des comptes (`company_change`), comme la fiche
-- Chorus. Aucune colonne existante touchée ; les binaires en place ne la
-- lisent pas.
--
-- Un HISTORIQUE, rien ne s'efface : la nature est une ligne vivante
-- (`withdrawn_at IS NULL`) ; démarquer la clôt, remarquer en écrit une neuve.
-- Au plus une ligne vivante par société (index unique partiel). `declared_by`
-- et `withdrawn_by` sont des identifiants de fiche staff sans clé étrangère,
-- comme les autres traces ; inscrits au registre RGPD.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : la
-- ressource `b2b_in_house_payers` est ajoutée par la migration suivante, et
-- s'accorde à l'écran (`/admin/staff-roles`).
--
-- Retour arrière : `prisma/rollback/20261126160000_le_payeur_maison.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."payer_in_house" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "declared_at" TIMESTAMPTZ(3) NOT NULL,
    "declared_by" TEXT NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_by" TEXT,

    CONSTRAINT "payer_in_house_pkey" PRIMARY KEY ("id"),
    -- Une clôture a toujours son auteur, et l'inverse.
    CONSTRAINT "payer_in_house_withdrawal_together"
      CHECK (("withdrawn_at" IS NULL) = ("withdrawn_by" IS NULL))
);

CREATE INDEX "payer_in_house_company_id_idx" ON "public"."payer_in_house"("company_id");

-- Au plus UNE période vivante par société : deux marquages simultanés ne
-- tiennent pas tous les deux.
CREATE UNIQUE INDEX "payer_in_house_live_company"
    ON "public"."payer_in_house"("company_id") WHERE "withdrawn_at" IS NULL;

ALTER TABLE "public"."payer_in_house"
  ADD CONSTRAINT "payer_in_house_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "payer_in_house_company_change_insert"
  AFTER INSERT ON "public"."payer_in_house"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "payer_in_house_company_change_update"
  AFTER UPDATE ON "public"."payer_in_house"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "payer_in_house_company_change_delete"
  AFTER DELETE ON "public"."payer_in_house"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
