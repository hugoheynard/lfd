-- LA FICHE DU SERVICE CHORUS D'UNE SOCIÉTÉ QUI COMMANDE
-- (documentation/comptabilite/facturation/plan-clients-publics-chorus.md,
-- § 6 octies, lot P2 ter).
--
-- ADDITIVE : une table neuve, vide, et les trois déclencheurs qui la font
-- compter dans le journal des comptes (`company_change`) — la fiche du
-- back-office la lit. Aucune colonne existante touchée. Les binaires en place
-- ne la lisent pas.
--
-- Une ligne par société qui commande (le sous-compte d'une unité, ou un
-- compte public seul) : son code service, et l'engagement en cours qui
-- préremplit ses commandes. `payer_company_id` est le payeur au moment du
-- geste, sans clé étrangère : la lecture ignore la fiche quand le payeur a
-- changé. Un engagement a toujours une fin : le CHECK lie le numéro et la
-- date. `recorded_by_staff_id` est un identifiant de fiche staff sans clé
-- étrangère, comme les autres traces ; inscrit au registre RGPD.
--
-- Retour arrière : `prisma/rollback/20261123100000_le_service_chorus.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."company_chorus_service" (
    "company_id" TEXT NOT NULL,
    "payer_company_id" TEXT NOT NULL,
    "service_code" TEXT NOT NULL DEFAULT '',
    "commitment_number" TEXT NOT NULL DEFAULT '',
    "commitment_ends_on" DATE,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by_staff_id" TEXT NOT NULL,
    "recorded_by_name" TEXT NOT NULL DEFAULT '',
    "recorded_by_role" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "company_chorus_service_pkey" PRIMARY KEY ("company_id"),
    CONSTRAINT "company_chorus_service_commitment_has_end"
      CHECK (("commitment_number" = '') = ("commitment_ends_on" IS NULL))
);

ALTER TABLE "public"."company_chorus_service"
  ADD CONSTRAINT "company_chorus_service_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "company_chorus_service_company_change_insert"
  AFTER INSERT ON "public"."company_chorus_service"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_chorus_service_company_change_update"
  AFTER UPDATE ON "public"."company_chorus_service"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_chorus_service_company_change_delete"
  AFTER DELETE ON "public"."company_chorus_service"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
