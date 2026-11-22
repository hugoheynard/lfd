-- Retour arrière de 20261122110000_le_vocabulaire_du_paiement : le schéma
-- `payment` redevient `card_payment`, ses tables, clés, index, contraintes,
-- fonctions et déclencheurs reprennent leurs noms d'avant, et les six
-- fonctions leur texte d'avant (`payment_guard` dans sa version de
-- `20261122100000_les_liens_vers_un_sujet`). Uniquement des renommages, sauf
-- le CHECK des comptes, reposé sous son ancien nom.
--
-- À jouer avec l'image d'avant V, dans une transaction (`psql -1`). La
-- dernière instruction retire V du journal de Prisma : sans elle,
-- `migrate deploy` la croirait appliquée.

CREATE OR REPLACE FUNCTION "payment"."card_payment_guard"() RETURNS trigger AS $$
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

CREATE OR REPLACE FUNCTION "payment"."card_refund_request_guard"() RETURNS trigger AS $$
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

CREATE OR REPLACE FUNCTION "payment"."card_refund_guard"() RETURNS trigger AS $$
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

CREATE OR REPLACE FUNCTION "payment"."refuse_delete"() RETURNS trigger AS $$
BEGIN
    IF current_setting('card_payment.purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'card_payment.% : une ligne d''encaissement ne s''efface pas — un paiement se ferme (closed) ; seule la purge du scénario efface, sous SET LOCAL card_payment.purge = ''on''.',
        TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "payment"."refuse_refund_delete"() RETURNS trigger AS $$
BEGIN
    IF current_setting('card_payment.purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'card_payment.% : un remboursement ne s''efface pas — une demande s''arrête (stopped), une ligne du carnet garde son statut ; seule la purge du scénario efface, sous SET LOCAL card_payment.purge = ''on''.',
        TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "payment"."pay_link_guard"() RETURNS trigger AS $$
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

ALTER TRIGGER "card_payment_guard" ON "payment"."card_payment" RENAME TO "payment_guard";
ALTER TRIGGER "card_payment_no_delete" ON "payment"."card_payment" RENAME TO "payment_no_delete";
ALTER TRIGGER "card_refund_guard" ON "payment"."card_refund" RENAME TO "refund_guard";
ALTER TRIGGER "card_refund_no_delete" ON "payment"."card_refund" RENAME TO "refund_no_delete";
ALTER TRIGGER "card_refund_request_guard" ON "payment"."card_refund_request" RENAME TO "refund_request_guard";
ALTER TRIGGER "card_refund_request_no_delete" ON "payment"."card_refund_request" RENAME TO "refund_request_no_delete";
ALTER TRIGGER "card_takeover_no_delete" ON "payment"."card_takeover" RENAME TO "takeover_no_delete";

ALTER FUNCTION "payment"."card_payment_guard"() RENAME TO "payment_guard";
ALTER FUNCTION "payment"."card_refund_guard"() RENAME TO "refund_guard";
ALTER FUNCTION "payment"."card_refund_request_guard"() RENAME TO "refund_request_guard";

ALTER TABLE "payment"."card_payment" DROP CONSTRAINT "card_payment_account_known";
ALTER TABLE "payment"."card_payment"
    ADD CONSTRAINT "payment_account_known" CHECK ("account" IN ('lfc-stripe'));

ALTER INDEX "payment"."card_payment_account_provider_ref_key" RENAME TO "payment_account_provider_ref_key";
ALTER INDEX "payment"."card_payment_first_per_subject_key" RENAME TO "payment_first_per_subject_key";
ALTER INDEX "payment"."card_payment_id_account_key" RENAME TO "payment_id_account_key";
ALTER INDEX "payment"."card_payment_pay_link_id_idx" RENAME TO "payment_pay_link_id_idx";
ALTER INDEX "payment"."card_payment_subject_type_subject_id_idx" RENAME TO "payment_subject_type_subject_id_idx";
ALTER INDEX "payment"."card_refund_account_provider_ref_key" RENAME TO "refund_account_provider_ref_key";
ALTER INDEX "payment"."card_refund_payment_id_idx" RENAME TO "refund_payment_id_idx";
ALTER INDEX "payment"."card_refund_request_id_idx" RENAME TO "refund_request_id_idx";
ALTER INDEX "payment"."card_refund_request_next_attempt_at_idx" RENAME TO "refund_request_next_attempt_at_idx";
ALTER INDEX "payment"."card_refund_request_payment_id_idx" RENAME TO "refund_request_payment_id_idx";
ALTER INDEX "payment"."card_refund_request_provider_ref_idx" RENAME TO "refund_request_provider_ref_idx";
ALTER INDEX "payment"."card_refund_request_remainder_in_progress_key" RENAME TO "refund_request_remainder_in_progress_key";

ALTER TABLE "payment"."card_payment" RENAME CONSTRAINT "card_payment_amount_positive" TO "payment_amount_positive";
ALTER TABLE "payment"."card_payment" RENAME CONSTRAINT "card_payment_pay_link_id_fkey" TO "payment_pay_link_id_fkey";
ALTER TABLE "payment"."card_payment" RENAME CONSTRAINT "card_payment_pkey" TO "payment_pkey";
ALTER TABLE "payment"."card_refund" RENAME CONSTRAINT "card_refund_amount_positive" TO "refund_amount_positive";
ALTER TABLE "payment"."card_refund" RENAME CONSTRAINT "card_refund_payment_id_account_fkey" TO "refund_payment_id_account_fkey";
ALTER TABLE "payment"."card_refund" RENAME CONSTRAINT "card_refund_pkey" TO "refund_pkey";
ALTER TABLE "payment"."card_refund" RENAME CONSTRAINT "card_refund_request_id_fkey" TO "refund_request_id_fkey";
ALTER TABLE "payment"."card_refund" RENAME CONSTRAINT "card_refund_source_matches_provider_ref" TO "refund_source_matches_provider_ref";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_amount_matches_form" TO "refund_request_amount_matches_form";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_announced_positive" TO "refund_request_announced_positive";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_attempts_positive" TO "refund_request_attempts_positive";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_generation_positive" TO "refund_request_generation_positive";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_issued_cents_positive" TO "refund_request_issued_cents_positive";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_issued_pair" TO "refund_request_issued_pair";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_payment_id_fkey" TO "refund_request_payment_id_fkey";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_pkey" TO "refund_request_pkey";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_reason_bounded" TO "refund_request_reason_bounded";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_round_positive" TO "refund_request_round_positive";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_settled_elsewhere" TO "refund_request_settled_elsewhere";
ALTER TABLE "payment"."card_refund_request" RENAME CONSTRAINT "card_refund_request_settled_reason_bounded" TO "refund_request_settled_reason_bounded";
ALTER TABLE "payment"."card_takeover" RENAME CONSTRAINT "card_takeover_pkey" TO "takeover_pkey";

ALTER TABLE "payment"."card_payment" RENAME TO "payment";
ALTER TABLE "payment"."card_refund" RENAME TO "refund";
ALTER TABLE "payment"."card_refund_request" RENAME TO "refund_request";
ALTER TABLE "payment"."card_takeover" RENAME TO "takeover";

ALTER SCHEMA "payment" RENAME TO "card_payment";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261122110000_le_vocabulaire_du_paiement';
