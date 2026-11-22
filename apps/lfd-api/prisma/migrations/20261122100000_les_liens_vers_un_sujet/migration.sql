-- LES LIENS DE PAIEMENT VERS UN SUJET — plan
-- `documentation/comptabilite/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
-- lot P1 (§2.1, §2.1 bis).
--
-- ADDITIVE : une table neuve dans `card_payment`, une colonne NULLABLE sur
-- `card_payment.payment` et sa clé étrangère, la fonction `payment_guard`
-- réécrite pour tenir cette colonne immuable. Aucune ligne existante
-- réécrite, aucun droit accordé à un rôle.
--
-- RETOUR ARRIÈRE (avant qu'un lien ne soit ouvert) :
--   ALTER TABLE "card_payment"."payment" DROP COLUMN "pay_link_id";
--   DROP TABLE "card_payment"."pay_link";
--   puis la fonction `payment_guard` de `20261109030000` remise telle quelle.
-- Après le premier lien ouvert : à ne pas faire.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LA TABLE ET LA COLONNE (ce que Prisma a écrit)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "card_payment"."pay_link" (
    "id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "payer_label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_sealed" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,

    CONSTRAINT "pay_link_pkey" PRIMARY KEY ("id"),
    -- Une révocation porte son instant ET son motif, ou ni l'un ni l'autre.
    CONSTRAINT "pay_link_revoked_pair" CHECK (
        ("revoked_at" IS NULL) = ("revoked_reason" IS NULL)
        AND ("revoked_reason" IS NULL OR length(btrim("revoked_reason")) > 0)
    ),
    -- Un lien nomme toujours son payeur et son auteur.
    CONSTRAINT "pay_link_labels_present" CHECK (
        length(btrim("payer_label")) > 0 AND length(btrim("created_by")) > 0
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_link_token_hash_key" ON "card_payment"."pay_link"("token_hash");

-- CreateIndex
CREATE INDEX "pay_link_subject_type_subject_id_idx" ON "card_payment"."pay_link"("subject_type", "subject_id");

-- Un seul lien VIVANT par sujet ; les révoqués s'accumulent. Partiel :
-- Prisma ne sait pas l'exprimer.
CREATE UNIQUE INDEX "pay_link_live_per_subject_key"
    ON "card_payment"."pay_link"("subject_type", "subject_id")
    WHERE "revoked_at" IS NULL;

-- AlterTable
ALTER TABLE "card_payment"."payment" ADD COLUMN     "pay_link_id" TEXT;

-- AddForeignKey
ALTER TABLE "card_payment"."payment" ADD CONSTRAINT "payment_pay_link_id_fkey" FOREIGN KEY ("pay_link_id") REFERENCES "card_payment"."pay_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- « Les paiements de ce lien » se lisent par cet index, sans balayer la table.
CREATE INDEX "payment_pay_link_id_idx" ON "card_payment"."payment"("pay_link_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LE LIEN : TOUT EST IMMUABLE, SAUF SA RÉVOCATION, POSÉE UNE FOIS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION "card_payment"."pay_link_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."subject_type" IS DISTINCT FROM OLD."subject_type"
       OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
       OR NEW."origin" IS DISTINCT FROM OLD."origin"
       OR NEW."payer_label" IS DISTINCT FROM OLD."payer_label"
       OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
       OR NEW."token_sealed" IS DISTINCT FROM OLD."token_sealed"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
       OR NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
        RAISE EXCEPTION 'card_payment.pay_link % : un lien ne change pas — on le révoque et on en ouvre un autre.',
            OLD."id";
    END IF;
    IF OLD."revoked_at" IS NOT NULL
       AND (NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at"
            OR NEW."revoked_reason" IS DISTINCT FROM OLD."revoked_reason") THEN
        RAISE EXCEPTION 'card_payment.pay_link % : révoqué le %, un lien ne se ranime pas et sa révocation ne se réécrit pas.',
            OLD."id", OLD."revoked_at";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "pay_link_guard"
    BEFORE UPDATE ON "card_payment"."pay_link"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."pay_link_guard"();

-- La fonction de `20261109030000` : refusé, sauf sous
-- `SET LOCAL card_payment.purge = 'on'`.
CREATE TRIGGER "pay_link_no_delete"
    BEFORE DELETE ON "card_payment"."pay_link"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refuse_delete"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE PAIEMENT : `pay_link_id` REJOINT LES COLONNES IMMUABLES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La fonction de `20261109030000`, mot pour mot, plus le bloc `pay_link_id`.
-- La colonne naît avec la ligne (`attach`) et ne se pose jamais après.

CREATE OR REPLACE FUNCTION "card_payment"."payment_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."subject_type" IS DISTINCT FROM OLD."subject_type"
       OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id" THEN
        RAISE EXCEPTION 'card_payment.payment % : le sujet d''un paiement ne change pas (%/% demandé, %/% en base) — un autre sujet appelle un autre paiement.',
            OLD."id", NEW."subject_type", NEW."subject_id", OLD."subject_type", OLD."subject_id";
    END IF;
    IF NEW."account" IS DISTINCT FROM OLD."account" THEN
        RAISE EXCEPTION 'card_payment.payment % : le compte d''encaissement ne change pas (% en base) — l''intention vit chez ce compte.',
            OLD."id", OLD."account";
    END IF;
    IF NEW."role" IS DISTINCT FROM OLD."role" THEN
        RAISE EXCEPTION 'card_payment.payment % : le rôle d''un paiement ne change pas (% en base).',
            OLD."id", OLD."role";
    END IF;
    IF NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents" THEN
        RAISE EXCEPTION 'card_payment.payment % : le montant d''un paiement ne change pas (% centimes en base) — un écart se règle par un complément ou un remboursement.',
            OLD."id", OLD."amount_cents";
    END IF;
    IF OLD."provider_ref" IS NOT NULL
       AND NEW."provider_ref" IS DISTINCT FROM OLD."provider_ref" THEN
        RAISE EXCEPTION 'card_payment.payment % : la référence chez le prestataire est posée (%) et ne change plus.',
            OLD."id", OLD."provider_ref";
    END IF;
    IF NEW."pay_link_id" IS DISTINCT FROM OLD."pay_link_id" THEN
        RAISE EXCEPTION 'card_payment.payment % : le lien d''où vient un paiement ne change pas (% en base) — il est posé à la naissance de la ligne.',
            OLD."id", COALESCE(OLD."pay_link_id", 'aucun');
    END IF;
    IF NEW."state" IS DISTINCT FROM OLD."state"
       AND (OLD."state"::text, NEW."state"::text) NOT IN (
           ('pending', 'paid'),
           ('pending', 'failed'),
           ('failed', 'paid'),
           ('pending', 'closed'),
           ('failed', 'closed'),
           ('closed', 'paid')
       ) THEN
        RAISE EXCEPTION 'card_payment.payment % : la transition % → % n''existe pas (plan M2, §3.4) — un événement périmé s''ignore, il ne s''écrit pas.',
            OLD."id", OLD."state", NEW."state";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
