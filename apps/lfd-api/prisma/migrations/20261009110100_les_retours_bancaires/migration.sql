-- LES RETOURS BANCAIRES — plan
-- `documentation/comptabilite/prelevement/plan-retours-bancaires.md`, lot R5a.
--
-- ADDITIVE : trois énumérations neuves, une table neuve, une colonne
-- nullable sur `collection_notice`, et le CHECK `order_collection_in_a_line`
-- REMPLACÉ par un CHECK qui admet `returned` avec sa ligne. Le nouveau est
-- posé AVANT que l'ancien soit retiré : il n'existe aucun instant sans garde.
-- Aucune ligne existante modifiée (aucune n'est `returned` : la valeur naît
-- avec `20261009110000`), aucun droit accordé à un rôle.
--
-- Retour arrière (migration EN AVANT, tant qu'aucun retour n'est saisi en
-- production) : reposer l'ancien CHECK, `DROP TABLE "collection_return"`,
-- `DROP COLUMN "represented_rejection_day"`, puis les trois `DROP TYPE`. Un
-- retour saisi est une pièce : ne pas le faire après le premier.

SET lock_timeout = '5s';

-- 1. Une commande `returned` garde sa ligne ; re-présentée, perdue ou réglée
--    autrement, elle la quitte (le retour garde la trace).
ALTER TABLE "public"."order_collection"
    ADD CONSTRAINT "order_collection_in_a_line_or_returned" CHECK (
        ("state" IN ('batched', 'collected', 'returned')) = ("batch_id" IS NOT NULL AND "line_rank" IS NOT NULL)
    );
ALTER TABLE "public"."order_collection" DROP CONSTRAINT "order_collection_in_a_line";

-- 2. Le retour : UN par transaction, désignée par son `EndToEndId` — la clé
--    d'appariement des fichiers de la banque (R5b), unique sur la ligne.
CREATE TYPE "public"."CollectionReturnKind" AS ENUM ('reject', 'return', 'refund_request');
CREATE TYPE "public"."CollectionReturnSource" AS ENUM ('manual', 'pain002', 'camt054');
CREATE TYPE "public"."CollectionReturnResolution" AS ENUM ('pending', 'represented', 'settled_otherwise', 'written_off');

CREATE TABLE "public"."collection_return" (
    "id"                   TEXT NOT NULL,
    "end_to_end_id"        TEXT NOT NULL,
    "kind"                 "public"."CollectionReturnKind" NOT NULL,
    "reason_code"          TEXT NOT NULL,
    "reason_label"         TEXT,
    "returned_on"          DATE NOT NULL,
    "amount_cents"         INTEGER NOT NULL,
    "fee_cents"            INTEGER,
    "source"               "public"."CollectionReturnSource" NOT NULL,
    "recorded_at"          TIMESTAMPTZ(3) NOT NULL,
    "recorded_by_staff_id" TEXT NOT NULL,
    "resolution"           "public"."CollectionReturnResolution" NOT NULL,
    "resolution_note"      TEXT,
    "resolved_at"          TIMESTAMPTZ(3),
    "resolved_by_staff_id" TEXT,

    CONSTRAINT "collection_return_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_return_end_to_end_id_fkey"
        FOREIGN KEY ("end_to_end_id") REFERENCES "public"."collection_batch_line"("end_to_end_id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_return_reason_code" CHECK ("reason_code" ~ '^[A-Z0-9]{4}$'),
    -- « Autre » (NARR) n'a de sens qu'avec ses mots.
    CONSTRAINT "collection_return_narrative_has_label" CHECK (
        "reason_code" <> 'NARR' OR "reason_label" IS NOT NULL
    ),
    CONSTRAINT "collection_return_amount" CHECK ("amount_cents" > 0),
    CONSTRAINT "collection_return_fee" CHECK ("fee_cents" IS NULL OR "fee_cents" >= 0),
    CONSTRAINT "collection_return_resolved_is_signed" CHECK (
        ("resolution" = 'pending') = ("resolved_at" IS NULL AND "resolved_by_staff_id" IS NULL)
    ),
    CONSTRAINT "collection_return_settled_has_note" CHECK (
        "resolution" NOT IN ('settled_otherwise', 'written_off') OR "resolution_note" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "collection_return_end_to_end_id_key" ON "public"."collection_return"("end_to_end_id");
CREATE INDEX "collection_return_resolution_idx" ON "public"."collection_return"("resolution");

-- 3. L'avis d'une re-présentation dit « nouvelle présentation du prélèvement
--    rejeté du … » (§ 2 bis-6). NULL pour tout avis d'avant, et tout avis
--    qui ne re-présente rien.
ALTER TABLE "public"."collection_notice"
    ADD COLUMN "represented_rejection_day" DATE;
