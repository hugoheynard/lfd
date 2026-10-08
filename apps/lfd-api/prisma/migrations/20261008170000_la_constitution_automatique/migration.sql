-- LA CONSTITUTION AUTOMATIQUE, UNE FOIS PAR CYCLE — lot PA3
-- (`documentation/facturation/plan-prelevement-automatique.md`)
--
-- ADDITIVE : une colonne neuve (avec défaut), une colonne rendue nullable,
-- une contrainte neuve, une table neuve. Aucune ligne existante réécrite
-- autrement que par le défaut `staff`, aucun droit accordé à un rôle.
--
-- 1. `collection_batch.constituted_by` : qui a préparé le lot, `staff` ou
--    `system` (l'automatisme). Les lots existants sont `staff` (le défaut
--    les remplit) ; `constituted_by_staff_id` devient nullable, et un CHECK
--    tient « staff ⇒ fiche présente, system ⇒ aucune » : le système n'est
--    jamais joint à l'annuaire.
-- 2. `collection_autopilot_run` : UNE tentative de l'automatisme par
--    (entité, clôture). La clé unique départage deux passages simultanés
--    (`INSERT … ON CONFLICT DO NOTHING`) et empêche de retenter — annuler un
--    lot ne relance donc pas l'automatisme : reconstituer reste un geste
--    humain. `pending` = prise, issue pas encore écrite (ou processus mort
--    entre les deux) ; `failed` porte toujours son message.
--
-- Retour arrière (migration EN AVANT, une fois qu'aucun binaire ne les lit) :
-- `DROP TABLE "public"."collection_autopilot_run"` ; pour le lot, seulement
-- tant qu'aucun lot `system` n'existe : `DROP CONSTRAINT
-- "collection_batch_constituted_by_author"`, `DROP COLUMN "constituted_by"`,
-- puis `SET NOT NULL` sur `constituted_by_staff_id`.

SET lock_timeout = '5s';

ALTER TABLE "public"."collection_batch"
    ADD COLUMN "constituted_by" TEXT NOT NULL DEFAULT 'staff';

ALTER TABLE "public"."collection_batch"
    ALTER COLUMN "constituted_by_staff_id" DROP NOT NULL;

ALTER TABLE "public"."collection_batch"
    ADD CONSTRAINT "collection_batch_constituted_by_author" CHECK (
        ("constituted_by" = 'staff' AND "constituted_by_staff_id" IS NOT NULL)
        OR ("constituted_by" = 'system' AND "constituted_by_staff_id" IS NULL)
    );

CREATE TABLE "public"."collection_autopilot_run" (
    "legal_entity_id" TEXT           NOT NULL,
    "cycle_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "ran_at"          TIMESTAMPTZ(3) NOT NULL,
    "outcome"         TEXT           NOT NULL,
    "message"         TEXT,

    CONSTRAINT "collection_autopilot_run_pkey" PRIMARY KEY ("legal_entity_id", "cycle_closes_at"),
    CONSTRAINT "collection_autopilot_run_outcome" CHECK (
        "outcome" IN ('pending', 'constituted', 'nothing_to_collect', 'not_yet_open', 'failed')
    ),
    CONSTRAINT "collection_autopilot_run_failure_explained" CHECK (
        "outcome" <> 'failed' OR "message" IS NOT NULL
    )
);

ALTER TABLE "public"."collection_autopilot_run"
    ADD CONSTRAINT "collection_autopilot_run_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
