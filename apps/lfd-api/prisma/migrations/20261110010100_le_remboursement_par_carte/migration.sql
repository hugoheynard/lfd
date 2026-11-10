-- LE REMBOURSEMENT PAR CARTE — plan
-- `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
-- lot P1 (§5.1), machines `refund_request.state` et `refund.status` (§3.4),
-- garanties G1 (§11).
--
-- ADDITIVE : cinq enums et deux tables dans `card_payment`, un enum et une
-- table dans `public`, un index unique sur `card_payment.payment`, leurs
-- gardes. Aucune ligne écrite : la copie de l'existant est la migration
-- suivante, À PART et sans DDL (`20261110010200_la_copie_des_remboursements`),
-- pour qu'un e2e la rejoue (§5.2). Aucune table existante modifiée hors de
-- l'index ci-dessous, aucun droit accordé à un rôle.
--
-- 🔴 Ce que Prisma ne sait pas écrire est ici et nulle part dans le schéma :
-- les CHECK, l'index unique partiel d'une `remainder` en cours, les trois
-- déclencheurs de garde et les deux refus de DELETE. Les modèles
-- `CardRefundRequest`, `CardRefund` (`prisma/schema/card_payment.prisma`) et
-- `RefundCredit` (`prisma/schema/public/invoice.prisma`) le disent dans leur
-- JSDoc.
--
-- RETOUR ARRIÈRE (avant que la copie ou le code n'écrive) :
--   DROP TABLE "public"."refund_credit";
--   DROP TABLE "card_payment"."refund";
--   DROP TABLE "card_payment"."refund_request";
--   DROP FUNCTION "card_payment"."refund_request_guard"(),
--                 "card_payment"."refund_guard"(),
--                 "card_payment"."refuse_refund_delete"(),
--                 "public"."refund_credit_written_once"();
--   DROP INDEX "card_payment"."payment_id_account_key";
--   DROP TYPE … (les six enums).
-- Après P1 déployé, il perd le carnet : à ne pas faire.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LES ENUMS, LES TABLES, LES INDEX, LES CLÉS (ce que Prisma a écrit)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "card_payment"."CardRefundRequestState" AS ENUM ('to_issue', 'issued', 'refunded', 'stopped', 'settled_elsewhere');

-- CreateEnum
CREATE TYPE "card_payment"."CardRefundForm" AS ENUM ('remainder', 'amount');

-- CreateEnum
CREATE TYPE "card_payment"."CardRefundNature" AS ENUM ('return', 'adjustment');

-- CreateEnum
CREATE TYPE "card_payment"."CardRefundSource" AS ENUM ('provider', 'manual');

-- CreateEnum
CREATE TYPE "card_payment"."CardRefundStatus" AS ENUM ('pending', 'requires_action', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "public"."RefundCreditReason" AS ENUM ('credit_note', 'adjustment');

-- CreateTable
CREATE TABLE "card_payment"."refund_request" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "form" "card_payment"."CardRefundForm" NOT NULL,
    "amount_cents" INTEGER,
    "nature" "card_payment"."CardRefundNature" NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "card_payment"."CardRefundRequestState" NOT NULL,
    "announced_cents" INTEGER NOT NULL,
    "issued_cents" INTEGER,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "requested_by" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "round" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_ref" TEXT,
    "issued_at" TIMESTAMPTZ(6),
    "last_failure" TEXT,
    "last_attempt_at" TIMESTAMPTZ(6),
    "claimed_until" TIMESTAMPTZ(6),
    "claim_token" TEXT,
    "next_attempt_at" TIMESTAMPTZ(6),
    "settled_by_staff_id" TEXT,
    "settled_reason" TEXT,

    CONSTRAINT "refund_request_pkey" PRIMARY KEY ("id"),
    -- G1 : `form = amount` ⇔ un montant, et un montant est positif (§5.1).
    CONSTRAINT "refund_request_amount_matches_form"
        CHECK (("form" = 'amount') = ("amount_cents" IS NOT NULL)
               AND ("amount_cents" IS NULL OR "amount_cents" > 0)),
    -- Ce qui a été annoncé, et ce que le prestataire a accepté : positifs.
    CONSTRAINT "refund_request_announced_positive" CHECK ("announced_cents" > 0),
    CONSTRAINT "refund_request_issued_cents_positive"
        CHECK ("issued_cents" IS NULL OR "issued_cents" > 0),
    -- Le `re_…` et son instant se posent et s'effacent ensemble (« Relancer »
    -- remet les deux à nul, §3.4) — la règle de `order_refund_request`.
    CONSTRAINT "refund_request_issued_pair"
        CHECK (("provider_ref" IS NULL) = ("issued_at" IS NULL)),
    CONSTRAINT "refund_request_generation_positive" CHECK ("generation" >= 1),
    CONSTRAINT "refund_request_round_positive" CHECK ("round" >= 1),
    CONSTRAINT "refund_request_attempts_positive" CHECK ("attempts" >= 0),
    -- Le motif est un code donné par le sujet (`cancellation`, `revision`…),
    -- pas une phrase : borné court.
    CONSTRAINT "refund_request_reason_bounded"
        CHECK (char_length("reason") BETWEEN 1 AND 64),
    -- G1 : `settled_elsewhere` ⇔ motif ET fiche staff (§5.5, §11) ; hors de
    -- cet état, ni l'un ni l'autre.
    CONSTRAINT "refund_request_settled_elsewhere"
        CHECK (("state" = 'settled_elsewhere') = ("settled_by_staff_id" IS NOT NULL)
               AND ("settled_by_staff_id" IS NULL) = ("settled_reason" IS NULL)),
    CONSTRAINT "refund_request_settled_reason_bounded"
        CHECK ("settled_reason" IS NULL OR char_length("settled_reason") BETWEEN 1 AND 500)
);

-- CreateTable
CREATE TABLE "card_payment"."refund" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "request_id" TEXT,
    "nature" "card_payment"."CardRefundNature",
    "source" "card_payment"."CardRefundSource" NOT NULL,
    "provider_ref" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "card_payment"."CardRefundStatus" NOT NULL,
    "refunded_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id"),
    -- G1 : un remboursement rend de l'argent — jamais zéro, jamais négatif.
    CONSTRAINT "refund_amount_positive" CHECK ("amount_cents" > 0),
    -- G1 : un remboursement chez le prestataire porte son `re_…`, un
    -- « rendu autrement » n'en porte pas (§5.1).
    CONSTRAINT "refund_source_matches_provider_ref"
        CHECK (("source" = 'provider') = ("provider_ref" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "public"."refund_credit" (
    "refund_id" TEXT NOT NULL,
    "credit_note_id" TEXT,
    "reason" "public"."RefundCreditReason" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refund_credit_pkey" PRIMARY KEY ("refund_id"),
    -- Une ligne `adjustment` n'a pas d'avoir ; une ligne `credit_note` en a un.
    CONSTRAINT "refund_credit_reason_matches_credit_note"
        CHECK (("reason" = 'credit_note') = ("credit_note_id" IS NOT NULL))
);

-- CreateIndex
CREATE INDEX "refund_request_payment_id_idx" ON "card_payment"."refund_request"("payment_id");

-- CreateIndex
CREATE INDEX "refund_request_next_attempt_at_idx" ON "card_payment"."refund_request"("next_attempt_at");

-- CreateIndex
-- Le constat retrouve la demande par son `re_…` (§3.4). Pas unique : la
-- demande ne porte pas de compte, et l'unicité vit au carnet, PAR compte.
CREATE INDEX "refund_request_provider_ref_idx" ON "card_payment"."refund_request"("provider_ref");

-- G1 : une seule `remainder` EN COURS par paiement (§5.1). Plusieurs
-- `stopped` ou `refunded` peuvent coexister (deux inversions). Partiel :
-- Prisma ne sait pas l'exprimer.
CREATE UNIQUE INDEX "refund_request_remainder_in_progress_key"
    ON "card_payment"."refund_request"("payment_id")
    WHERE "form" = 'remainder' AND "state" IN ('to_issue', 'issued');

-- CreateIndex
CREATE INDEX "refund_payment_id_idx" ON "card_payment"."refund"("payment_id");

-- CreateIndex
CREATE INDEX "refund_request_id_idx" ON "card_payment"."refund"("request_id");

-- CreateIndex
-- G1 : un `re_…` est unique PAR COMPTE ; un `manual` (NULL) ne gêne personne.
CREATE UNIQUE INDEX "refund_account_provider_ref_key" ON "card_payment"."refund"("account", "provider_ref");

-- CreateIndex
-- G1 : un remboursement par avoir ; les lignes `adjustment` (NULL) ne se
-- gênent pas — l'unicité d'`order_refund.credit_note_id`, conservée.
CREATE UNIQUE INDEX "refund_credit_credit_note_id_key" ON "public"."refund_credit"("credit_note_id");

-- CreateIndex
-- La cible de la clé composée du carnet : `id` est déjà unique, ce second
-- index ne refuse rien de plus sur `payment`.
CREATE UNIQUE INDEX "payment_id_account_key" ON "card_payment"."payment"("id", "account");

-- AddForeignKey
ALTER TABLE "card_payment"."refund_request" ADD CONSTRAINT "refund_request_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "card_payment"."payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- `(payment_id, account)` : un remboursement porte le compte de SON paiement
-- (« recopié du paiement », §5.1), donc un compte que le CHECK
-- `payment_account_known` admet — sans second CHECK à tenir d'accord avec le
-- registre `card-accounts`.
ALTER TABLE "card_payment"."refund" ADD CONSTRAINT "refund_payment_id_account_fkey" FOREIGN KEY ("payment_id", "account") REFERENCES "card_payment"."payment"("id", "account") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_payment"."refund" ADD CONSTRAINT "refund_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "card_payment"."refund_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- `refund_credit` tient l'avoir ; elle ne tient PAS `card_payment.refund`
-- (`refund_id` opaque, §5.1 v13) : aucune clé ne va de `public` vers
-- `card_payment`.
ALTER TABLE "public"."refund_credit" ADD CONSTRAINT "refund_credit_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "public"."invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LA MACHINE `refund_request.state` ET SES COLONNES IMMUABLES (§3.4)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Transitions admises, et elles seules :
--   to_issue → issued             (exécuteur : re_… pending ; constat arrivé avant lui)
--   to_issue → refunded           (re_… succeeded ; nothing_left ; paiement sans reste)
--   to_issue → stopped            (declined, nothing_left d'une amount, no_intent, rejected)
--   issued   → refunded           (constat succeeded)
--   issued   → stopped            (constat failed/canceled ; carnet refuse le re_…)
--   stopped  → to_issue           (« Relancer »)
--   stopped  → refunded           (constat : paiement sans reste)
--   stopped  → settled_elsewhere  (« rendu autrement »)
--   refunded → stopped            (inversion)
--   x        → x                  (rejeu, ou une écriture qui ne touche pas l'état)
--
-- `settled_elsewhere` est terminal.
--
-- Immuables : `payment_id`, `form`, `amount_cents`, `nature`, `reason` —
-- comparées par `IS DISTINCT FROM` (`amount_cents` est nullable : `<>`
-- laisserait passer `NULL`).

CREATE FUNCTION "card_payment"."refund_request_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."payment_id" IS DISTINCT FROM OLD."payment_id" THEN
        RAISE EXCEPTION 'card_payment.refund_request % : le paiement d''une demande ne change pas (% en base) — un autre paiement appelle une autre demande.',
            OLD."id", OLD."payment_id";
    END IF;
    IF NEW."form" IS DISTINCT FROM OLD."form"
       OR NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents" THEN
        RAISE EXCEPTION 'card_payment.refund_request % : la forme et le montant d''une demande ne changent pas (%, % centimes en base) — un autre montant appelle une autre demande.',
            OLD."id", OLD."form", OLD."amount_cents";
    END IF;
    IF NEW."nature" IS DISTINCT FROM OLD."nature"
       OR NEW."reason" IS DISTINCT FROM OLD."reason" THEN
        RAISE EXCEPTION 'card_payment.refund_request % : la nature et le motif d''une demande ne changent pas (%, % en base).',
            OLD."id", OLD."nature", OLD."reason";
    END IF;
    IF NEW."state" IS DISTINCT FROM OLD."state"
       AND (OLD."state"::text, NEW."state"::text) NOT IN (
           ('to_issue', 'issued'),
           ('to_issue', 'refunded'),
           ('to_issue', 'stopped'),
           ('issued', 'refunded'),
           ('issued', 'stopped'),
           ('stopped', 'to_issue'),
           ('stopped', 'refunded'),
           ('stopped', 'settled_elsewhere'),
           ('refunded', 'stopped')
       ) THEN
        RAISE EXCEPTION 'card_payment.refund_request % : la transition % → % n''existe pas (plan M2, §3.4) — une demande arrêtée se relance ou se dit rendue autrement.',
            OLD."id", OLD."state", NEW."state";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refund_request_guard"
    BEFORE UPDATE ON "card_payment"."refund_request"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refund_request_guard"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE CARNET `refund.status` ET SES COLONNES IMMUABLES (§3.4)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Les transitions d'aujourd'hui (`refundTransition`,
-- `src/b2b/orders/domain/entities/order-refund.ts`, relu le 2026-11-10) :
-- un statut ouvert (`pending`, `requires_action`) va partout ; `succeeded`
-- ne va qu'à `failed` (une inversion, §6.2) ; `failed` et `canceled` sont
-- terminaux. Ce que le code dit `stale` (un statut qui recule) s'ignore sans
-- s'écrire ; ce qu'il dit `illegal` (`succeeded → canceled`) est refusé —
-- ici comme chez le prestataire.
--
-- Immuables : `payment_id`, `account`, `provider_ref`, `amount_cents`,
-- `nature`, `source`.

CREATE FUNCTION "card_payment"."refund_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
       OR NEW."account" IS DISTINCT FROM OLD."account" THEN
        RAISE EXCEPTION 'card_payment.refund % : le paiement et le compte d''un remboursement ne changent pas (%, % en base).',
            OLD."id", OLD."payment_id", OLD."account";
    END IF;
    IF NEW."provider_ref" IS DISTINCT FROM OLD."provider_ref"
       OR NEW."source" IS DISTINCT FROM OLD."source" THEN
        RAISE EXCEPTION 'card_payment.refund % : la source et la référence d''un remboursement ne changent pas (%, % en base) — un autre re_… est une autre ligne.',
            OLD."id", OLD."source", OLD."provider_ref";
    END IF;
    IF NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents" THEN
        RAISE EXCEPTION 'card_payment.refund % : le montant d''un remboursement ne change pas (% centimes en base).',
            OLD."id", OLD."amount_cents";
    END IF;
    IF NEW."nature" IS DISTINCT FROM OLD."nature" THEN
        RAISE EXCEPTION 'card_payment.refund % : la nature d''un remboursement ne change pas (% en base).',
            OLD."id", OLD."nature";
    END IF;
    IF NEW."status" IS DISTINCT FROM OLD."status"
       AND (OLD."status"::text, NEW."status"::text) NOT IN (
           ('pending', 'requires_action'),
           ('pending', 'succeeded'),
           ('pending', 'failed'),
           ('pending', 'canceled'),
           ('requires_action', 'pending'),
           ('requires_action', 'succeeded'),
           ('requires_action', 'failed'),
           ('requires_action', 'canceled'),
           ('succeeded', 'failed')
       ) THEN
        RAISE EXCEPTION 'card_payment.refund % : la transition % → % n''existe pas (plan M2, §3.4) — un statut périmé s''ignore, il ne s''écrit pas.',
            OLD."id", OLD."status", NEW."status";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refund_guard"
    BEFORE UPDATE ON "card_payment"."refund"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refund_guard"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PAS DE DELETE, SAUF LA PURGE (§3.4, G1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Même règle que `payment` (`20261109030000_…`) : seule la purge du scénario
-- efface, sous `SET LOCAL card_payment.purge = 'on'` DANS une transaction.
-- Une fonction à part de `refuse_delete` pour que le refus nomme le geste de
-- sortie d'un remboursement, pas celui d'un paiement. Un `TRUNCATE` n'est pas
-- couvert : voulu pour `ctx.reset()` (G1, §11).

CREATE FUNCTION "card_payment"."refuse_refund_delete"() RETURNS trigger AS $$
BEGIN
    IF current_setting('card_payment.purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'card_payment.% : un remboursement ne s''efface pas — une demande s''arrête (stopped), une ligne du carnet garde son statut ; seule la purge du scénario efface, sous SET LOCAL card_payment.purge = ''on''.',
        TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refund_request_no_delete"
    BEFORE DELETE ON "card_payment"."refund_request"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refuse_refund_delete"();

CREATE TRIGGER "refund_no_delete"
    BEFORE DELETE ON "card_payment"."refund"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refuse_refund_delete"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. `refund_credit` S'ÉCRIT UNE FOIS (§5.1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- L'écriture conditionnée d'`order_refund_credit_note_once`
-- (`20261009000000_la_facture_carte`), conservée : là-bas, l'avoir se posait
-- une fois sur la ligne du carnet ; ici, la ligne naît avec son avoir (ou sa
-- raison `adjustment`) et ne change plus. Un second avoir pour le même
-- remboursement est refusé par la clé primaire, un second remboursement pour
-- le même avoir par l'unicité de `credit_note_id`.

CREATE FUNCTION "public"."refund_credit_written_once"() RETURNS trigger AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'refund_credit : le rapprochement du remboursement % est écrit (avoir %, %) et ne change plus — une seconde écriture est une erreur du rapprochement, pas une correction.',
            OLD."refund_id", OLD."credit_note_id", OLD."reason";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refund_credit_written_once"
    BEFORE UPDATE ON "public"."refund_credit"
    FOR EACH ROW EXECUTE FUNCTION "public"."refund_credit_written_once"();
