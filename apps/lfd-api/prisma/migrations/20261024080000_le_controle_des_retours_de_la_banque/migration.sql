-- LE CONTRÔLE DES RETOURS DE LA BANQUE — « Retours contrôlés »
-- (`documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
-- § 1.2, § 3.4, § 7 S4, lot P3)
--
-- Un import qui ne trouve aucun impayé n'écrit rien : rien ne disait qu'un
-- jour avait été contrôlé. Une table NEUVE, un registre d'ajouts : une ligne
-- par attestation (entité × jour de Paris), et une attestation fausse se
-- retire par une ligne de plus (`withdrawn`, note obligatoire). La dernière
-- ligne d'un jour fait foi — règle de LECTURE, tenue par le code
-- (`bank-return-checks.ts`), pas par la base.
--
-- ADDITIVE : une table et sa fonction de garde, aucune table existante
-- touchée, aucune ligne réécrite, aucun droit accordé à un rôle. L'auteur
-- (`checked_by_staff_id`, identifiant staff LOCAL) est au registre RGPD.
-- Pas de clé étrangère sur l'auteur, comme ses voisines
-- `deposited_by_staff_id` et `abandoned_by_staff_id`.
--
-- Le déclencheur `bank_return_check_append_only` refuse UPDATE et DELETE :
-- « on n'efface rien » est inexprimable, pas seulement non fait. (TRUNCATE
-- ne déclenche pas une garde par ligne : la remise à zéro des e2e passe.)
--
-- Retour arrière (tant qu'aucune attestation n'est posée en production) :
-- `DROP TABLE "public"."bank_return_check"; DROP FUNCTION
-- "public"."bank_return_check_append_only"();`. Après : NE PAS le faire —
-- les contrôles attestés sont la trace de la procédure.

SET lock_timeout = '5s';

CREATE TABLE "public"."bank_return_check" (
    "id"                  TEXT NOT NULL,
    "legal_entity_id"     TEXT NOT NULL,
    "day"                 DATE NOT NULL,
    "checked_at"          TIMESTAMPTZ(3) NOT NULL,
    "checked_by_staff_id" TEXT NOT NULL,
    "withdrawn"           BOOLEAN NOT NULL DEFAULT false,
    "note"                TEXT,

    CONSTRAINT "bank_return_check_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_return_check_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id")
        REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Un retrait dit pourquoi ; une attestation n'a pas de note.
    CONSTRAINT "bank_return_check_withdrawal_said" CHECK (
        ("withdrawn" AND "note" IS NOT NULL AND length(btrim("note")) BETWEEN 1 AND 500)
        OR (NOT "withdrawn" AND "note" IS NULL)
    )
);

CREATE INDEX "bank_return_check_legal_entity_id_day_idx"
    ON "public"."bank_return_check"("legal_entity_id", "day");

CREATE FUNCTION "public"."bank_return_check_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'bank_return_check_append_only: une attestation ne se modifie ni ne s''efface (%), elle se retire par une ligne de plus', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "bank_return_check_append_only"
    BEFORE UPDATE OR DELETE ON "public"."bank_return_check"
    FOR EACH ROW EXECUTE FUNCTION "public"."bank_return_check_append_only"();
