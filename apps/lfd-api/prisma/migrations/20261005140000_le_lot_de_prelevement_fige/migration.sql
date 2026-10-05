-- LE LOT DE PRÉLÈVEMENT FIGÉ — plan
-- `documentation/comptabilite/plan-lot-de-prelevement-fige.md`, lot P1 (§1-§4).
--
-- ADDITIVE : trois énumérations neuves, quatre tables neuves, une ligne
-- semée dans la seule table qui en a besoin. Aucune ligne existante modifiée,
-- aucune colonne resserrée, aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (migration EN AVANT, une fois qu'aucun binaire ne
-- les lit) : `DROP TABLE "order_collection", "collection_batch_line",
-- "collection_batch", "collection_floor"`, puis les trois `DROP TYPE`. Un lot
-- DÉPOSÉ est une pièce : ne pas le faire après le premier dépôt.

SET lock_timeout = '5s';

CREATE TYPE "CollectionBatchStatus" AS ENUM ('constituted', 'deposited', 'cancelled');
CREATE TYPE "OrderCollectionState" AS ENUM ('due', 'batched', 'excluded', 'collected', 'settled_otherwise');
CREATE TYPE "CollectionExclusionReason" AS ENUM ('no_mandate', 'payer_detached', 'one_off_consumed', 'ambiguous_creditor');

-- 1. Le lot : UN fichier d'une entité, d'un schéma, d'un cycle.
CREATE TABLE "collection_batch" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "scheme" "SepaScheme" NOT NULL,
    "cycle_starts_at" TIMESTAMPTZ(3) NOT NULL,
    "cycle_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "CollectionBatchStatus" NOT NULL,
    "constituted_at" TIMESTAMPTZ(3) NOT NULL,
    "constituted_by_staff_id" TEXT NOT NULL,
    "deposited_at" TIMESTAMPTZ(3),
    "deposited_by_staff_id" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_staff_id" TEXT,
    "unmandated_companies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "xml" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,

    CONSTRAINT "collection_batch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_batch_legal_entity_id_fkey"
        FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_batch_window" CHECK ("cycle_closes_at" > "cycle_starts_at"),
    -- Un lot déposé dit quand et par qui ; un lot annulé aussi. Jamais les deux.
    CONSTRAINT "collection_batch_deposited_is_signed" CHECK (
        ("status" = 'deposited') = ("deposited_at" IS NOT NULL AND "deposited_by_staff_id" IS NOT NULL)
    ),
    CONSTRAINT "collection_batch_cancelled_is_signed" CHECK (
        ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancelled_by_staff_id" IS NOT NULL)
    ),
    CONSTRAINT "collection_batch_sha256" CHECK ("file_sha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "collection_batch_legal_entity_id_cycle_closes_at_idx"
    ON "collection_batch"("legal_entity_id", "cycle_closes_at");

-- Un seul lot VIVANT par (entité, schéma, clôture) : deux constitutions
-- concurrentes ne peuvent pas rendre deux fichiers du même cycle. Un lot
-- annulé n'y compte pas — le reconstituer est le geste prévu.
CREATE UNIQUE INDEX "collection_batch_one_live_per_cycle"
    ON "collection_batch"("legal_entity_id", "scheme", "cycle_closes_at")
    WHERE "status" <> 'cancelled';

-- 2. Les lignes : un débiteur, le mandat figé, le montant.
CREATE TABLE "collection_batch_line" (
    "batch_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "end_to_end_id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "mandate_reference" TEXT NOT NULL,
    "mandate_signed_at" TIMESTAMPTZ(3) NOT NULL,
    "debtor_company_id" TEXT NOT NULL,
    "debtor_name" TEXT NOT NULL,
    "debtor_iban_sealed" TEXT NOT NULL,
    "debtor_iban_last4" TEXT NOT NULL,
    "debtor_bic" TEXT,
    "sequence" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "order_count" INTEGER NOT NULL,
    "prior_order_count" INTEGER NOT NULL,

    CONSTRAINT "collection_batch_line_pkey" PRIMARY KEY ("batch_id", "rank"),
    CONSTRAINT "collection_batch_line_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "collection_batch"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_batch_line_rank" CHECK ("rank" >= 1),
    CONSTRAINT "collection_batch_line_amount" CHECK ("amount_cents" > 0),
    CONSTRAINT "collection_batch_line_orders" CHECK (
        "order_count" >= 1 AND "prior_order_count" >= 0 AND "prior_order_count" <= "order_count"
    ),
    CONSTRAINT "collection_batch_line_sequence" CHECK ("sequence" IN ('RCUR', 'OOFF'))
);

CREATE UNIQUE INDEX "collection_batch_line_end_to_end_id_key" ON "collection_batch_line"("end_to_end_id");
CREATE INDEX "collection_batch_line_mandate_id_idx" ON "collection_batch_line"("mandate_id");

-- 3. L'état d'encaissement d'une commande. `order_id` est OPAQUE : aucune clé
--    étrangère vers `orders`, comme tout ce qui cite une commande en snapshot.
--    L'absence de ligne vaut `due`.
CREATE TABLE "order_collection" (
    "order_id" TEXT NOT NULL,
    "state" "OrderCollectionState" NOT NULL,
    "batch_id" TEXT,
    "line_rank" INTEGER,
    "exclusion_reason" "CollectionExclusionReason",
    "amount_cents" INTEGER NOT NULL,
    "settled_note" TEXT,
    "settled_by_staff_id" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_collection_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "order_collection_batch_id_line_rank_fkey"
        FOREIGN KEY ("batch_id", "line_rank") REFERENCES "collection_batch_line"("batch_id", "rank")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_collection_in_a_line" CHECK (
        ("state" IN ('batched', 'collected')) = ("batch_id" IS NOT NULL AND "line_rank" IS NOT NULL)
    ),
    CONSTRAINT "order_collection_excluded_has_reason" CHECK (
        ("state" = 'excluded') = ("exclusion_reason" IS NOT NULL)
    ),
    CONSTRAINT "order_collection_settled_is_signed" CHECK (
        ("state" = 'settled_otherwise') = ("settled_note" IS NOT NULL AND "settled_by_staff_id" IS NOT NULL)
    ),
    CONSTRAINT "order_collection_amount" CHECK ("amount_cents" > 0)
);

CREATE INDEX "order_collection_state_idx" ON "order_collection"("state");
CREATE INDEX "order_collection_batch_id_idx" ON "order_collection"("batch_id");

-- 4. Le plancher. UNE ligne, posée ICI, à l'instant où la migration est
--    appliquée : `now()` dans une migration vaut l'instant de début de sa
--    transaction, c'est-à-dire le déploiement de P1. Aucune commande créée
--    avant n'entre jamais dans un lot : rien n'a été prélevé par ce
--    mécanisme, et les reprendre serait un geste à part (plan §3).
CREATE TABLE "collection_floor" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "floor_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collection_floor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_floor_singleton" CHECK ("id")
);

INSERT INTO "collection_floor" ("id", "floor_at") VALUES (true, now());
