-- LA FICHE CHORUS PRO D'UN ORGANISME PUBLIC
-- (documentation/comptabilite/facturation/plan-clients-publics-chorus.md,
-- § 6 bis, lot P1a).
--
-- ADDITIVE : une table neuve, vide, et les trois déclencheurs qui la font
-- compter dans le journal des comptes (`company_change`) — la fiche du
-- back-office la lit. Aucune colonne existante touchée. Les binaires en place
-- ne la lisent pas.
--
-- La nature publique d'un compte EST sa forme juridique (texte libre, sans
-- CHECK) : les quatre formes publiques n'ont besoin d'aucune migration.
-- `checked_by_staff_id` est un identifiant de fiche staff sans clé étrangère,
-- comme les autres traces ; inscrit au registre RGPD.
--
-- Retour arrière : `prisma/rollback/20261118140000_la_fiche_chorus.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."company_chorus_routing" (
    "company_id" TEXT NOT NULL,
    "commitment_required" BOOLEAN NOT NULL,
    "service_code_required" BOOLEAN NOT NULL,
    "default_service_code" TEXT NOT NULL DEFAULT '',
    "checked_on" DATE NOT NULL,
    "checked_by_staff_id" TEXT NOT NULL,
    "checked_by_name" TEXT NOT NULL DEFAULT '',
    "checked_by_role" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "company_chorus_routing_pkey" PRIMARY KEY ("company_id")
);

ALTER TABLE "public"."company_chorus_routing"
  ADD CONSTRAINT "company_chorus_routing_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "company_chorus_routing_company_change_insert"
  AFTER INSERT ON "public"."company_chorus_routing"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_chorus_routing_company_change_update"
  AFTER UPDATE ON "public"."company_chorus_routing"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_chorus_routing_company_change_delete"
  AFTER DELETE ON "public"."company_chorus_routing"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
