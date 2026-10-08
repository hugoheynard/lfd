-- L'AVIS DE PRÉLÈVEMENT — lot PA2
-- (`documentation/facturation/plan-prelevement-automatique.md`)
--
-- ADDITIVE : deux énumérations neuves, une table neuve, une colonne neuve
-- nullable. Aucune ligne existante modifiée, aucun droit accordé à un rôle.
--
-- 1. `collection_notice` : l'avis d'un payeur, écrit dans la transaction du
--    lot, avec son état (`queued` → `sent` | `failed`, ou `unsendable`). Le
--    dépôt exige tous les avis du lot `sent`. Une annulation (payeur qui n'est
--    plus prélevé après reconstitution) n'a ni lot ni ligne.
-- 2. `collection_batch.postponed_from_day` : l'échéance du calendrier quand
--    une constitution tardive l'a repoussée (D4). NULL pour les lots d'avant.
--
-- Retour arrière (migration EN AVANT, une fois qu'aucun binaire ne les lit) :
-- `DROP TABLE "public"."collection_notice"`, les deux `DROP TYPE`, puis
-- `ALTER TABLE "public"."collection_batch" DROP COLUMN "postponed_from_day"`.
-- Un avis ENVOYÉ est une pièce (la pré-notification) : ne pas le faire après
-- le premier envoi.

SET lock_timeout = '5s';

CREATE TYPE "public"."CollectionNoticeKind" AS ENUM ('notice', 'correction', 'cancellation', 'unchanged');
CREATE TYPE "public"."CollectionNoticeStatus" AS ENUM ('queued', 'sent', 'failed', 'unsendable');

ALTER TABLE "public"."collection_batch" ADD COLUMN "postponed_from_day" DATE;

CREATE TABLE "public"."collection_notice" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "cycle_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "batch_id" TEXT,
    "line_rank" INTEGER,
    "debtor_company_id" TEXT NOT NULL,
    "debtor_name" TEXT NOT NULL,
    "kind" "public"."CollectionNoticeKind" NOT NULL,
    "status" "public"."CollectionNoticeStatus" NOT NULL,
    "recipient_email" TEXT,
    "recipient_source" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "collection_day" DATE NOT NULL,
    "previous_amount_cents" INTEGER,
    "previous_collection_day" DATE,
    "mandate_reference" TEXT NOT NULL,
    "statement_id" TEXT,
    "creditor_name" TEXT NOT NULL,
    "creditor_ics" TEXT NOT NULL,
    "supersedes_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure" TEXT,

    CONSTRAINT "collection_notice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_notice_amount_positive" CHECK ("amount_cents" > 0),
    -- Une annulation n'appartient à aucun lot ; les autres avis à une ligne.
    CONSTRAINT "collection_notice_line" CHECK (
        ("kind" = 'cancellation') = ("batch_id" IS NULL AND "line_rank" IS NULL)
        AND ("batch_id" IS NULL) = ("line_rank" IS NULL)
    ),
    -- Un rectificatif dit ce qu'il rectifie.
    CONSTRAINT "collection_notice_correction_has_previous" CHECK (
        "kind" <> 'correction'
        OR ("previous_amount_cents" IS NOT NULL AND "previous_collection_day" IS NOT NULL)
    ),
    -- Non envoyable ⇔ sans adresse ; l'adresse dit toujours d'où elle vient.
    CONSTRAINT "collection_notice_recipient" CHECK (
        ("status" = 'unsendable') = ("recipient_email" IS NULL)
        AND ("recipient_email" IS NULL) = ("recipient_source" IS NULL)
        AND ("recipient_source" IS NULL OR "recipient_source" IN ('billing_contact', 'owner'))
    ),
    CONSTRAINT "collection_notice_sent_is_dated" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL)),
    CONSTRAINT "collection_notice_failed_is_explained" CHECK (
        ("status" = 'failed') = ("failed_at" IS NOT NULL AND "failure" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "collection_notice_batch_id_line_rank_key"
    ON "public"."collection_notice"("batch_id", "line_rank");

CREATE INDEX "collection_notice_legal_entity_id_cycle_closes_at_idx"
    ON "public"."collection_notice"("legal_entity_id", "cycle_closes_at");

ALTER TABLE "public"."collection_notice"
    ADD CONSTRAINT "collection_notice_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batch"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
