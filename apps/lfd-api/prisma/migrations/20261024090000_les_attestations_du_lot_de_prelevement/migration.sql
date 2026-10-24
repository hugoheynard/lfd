-- LES ATTESTATIONS DU LOT DE PRÉLÈVEMENT — « Contrôle CSV relu »,
-- « Remise signée sur CENET », « Accusés PSR lus »
-- (`documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
-- § 1.2, § 3.3, § 7 S4, lot P3)
--
-- Trois gestes faits HORS de l'outil (CENET, ou la relecture d'un CSV) que
-- rien ne peut constater. Une table NEUVE, un registre d'ajouts : une ligne
-- par attestation (lot × sorte), et une attestation fausse se retire par une
-- ligne de plus (`withdrawn`, note obligatoire). La dernière ligne d'un
-- (lot, sorte) fait foi — règle de LECTURE, tenue par le code
-- (`collection-batch-attestations.ts`), pas par la base.
--
-- Une attestation ne conditionne AUCUN geste du domaine : elle ne gouverne
-- que l'écran (l'onglet 3 de la procédure). Rien ici ne touche
-- `collection_batch`.
--
-- ADDITIVE : une table et sa fonction de garde, aucune table existante
-- touchée, aucune ligne réécrite, aucun droit accordé à un rôle. L'auteur
-- (`attested_by_staff_id`, identifiant staff LOCAL) est au registre RGPD.
-- Pas de clé étrangère sur l'auteur, comme sa voisine
-- `bank_return_check.checked_by_staff_id`.
--
-- `kind` est un TEXT borné par CHECK plutôt qu'un enum Postgres : une sorte
-- de plus s'ajoute en changeant la contrainte, sans `ALTER TYPE`.
--
-- Le déclencheur `collection_batch_attestation_append_only` refuse UPDATE et
-- DELETE : « on n'efface rien » est inexprimable, pas seulement non fait.
-- (TRUNCATE ne déclenche pas une garde par ligne : la remise à zéro des e2e
-- passe.)
--
-- Retour arrière (tant qu'aucune attestation n'est posée en production) :
-- `DROP TABLE "public"."collection_batch_attestation"; DROP FUNCTION
-- "public"."collection_batch_attestation_append_only"();`. Après : NE PAS le
-- faire — les attestations sont la trace de la procédure.

SET lock_timeout = '5s';

CREATE TABLE "public"."collection_batch_attestation" (
    "id"                   TEXT NOT NULL,
    "batch_id"             TEXT NOT NULL,
    "kind"                 TEXT NOT NULL,
    "attested_at"          TIMESTAMPTZ(3) NOT NULL,
    "attested_by_staff_id" TEXT NOT NULL,
    "withdrawn"            BOOLEAN NOT NULL DEFAULT false,
    "note"                 TEXT,

    CONSTRAINT "collection_batch_attestation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_batch_attestation_batch_id_fkey" FOREIGN KEY ("batch_id")
        REFERENCES "public"."collection_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_batch_attestation_kind_known" CHECK (
        "kind" IN ('audit_reviewed', 'remittance_signed', 'psr_read')
    ),
    -- Un retrait dit pourquoi ; une attestation n'a pas de note.
    CONSTRAINT "collection_batch_attestation_withdrawal_said" CHECK (
        ("withdrawn" AND "note" IS NOT NULL AND length(btrim("note")) BETWEEN 1 AND 500)
        OR (NOT "withdrawn" AND "note" IS NULL)
    )
);

CREATE INDEX "collection_batch_attestation_batch_id_kind_idx"
    ON "public"."collection_batch_attestation"("batch_id", "kind");

CREATE FUNCTION "public"."collection_batch_attestation_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'collection_batch_attestation_append_only: une attestation ne se modifie ni ne s''efface (%), elle se retire par une ligne de plus', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collection_batch_attestation_append_only"
    BEFORE UPDATE OR DELETE ON "public"."collection_batch_attestation"
    FOR EACH ROW EXECUTE FUNCTION "public"."collection_batch_attestation_append_only"();
