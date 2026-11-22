-- LE VIREMENT REÇU REJOINT `payment` — plan
-- `documentation/payment/plan-le-virement-recu-dans-payment.md`, lot D1.
--
-- Les deux tables du virement reçu quittent `public` (la facturation) pour le
-- schéma `payment`, PAR RENOMMAGE : aucune ligne n'est copiée ni réécrite.
--
--   public.received_bank_transfer          → payment.transfer_received
--     legal_entity_id  → received_into     (opaque : l'entité qui reçoit)
--     payer_company_id → payer_ref         (opaque : le payeur déclaré)
--   public.received_bank_transfer_invoice  → payment.transfer_allocation
--     invoice_id       → subject_id        (+ subject_type, 'invoice' seul admis)
--
-- AUCUNE CLÉ ÉTRANGÈRE ENTRE LES BLOCS (décidé par Hugo le 2026-11-22) : les
-- trois qui traversaient sont retirées — vers `legal_entities`, vers `invoice`,
-- et depuis `order_collection.bank_transfer_id`. La colonne
-- `order_collection.bank_transfer_id` RESTE, opaque, avec son CHECK
-- `order_collection_settled_by_transfer_cites_it` : c'est la trace de la
-- facturation. La FK interne `transfer_allocation.transfer_id` reste (même
-- bloc). La cohérence des deux côtés tient par le même identifiant écrit par
-- un seul geste, l'ajout seul des deux côtés, et le contrôle de nuit
-- (`admin/accounting/bank-transfers/consistency`).
--
-- L'ajout seul : la fonction est recréée dans `payment`, les deux déclencheurs
-- y sont rebranchés, l'ancienne fonction `public.` est supprimée.
--
-- RETOUR ARRIÈRE : `prisma/rollback/20261122180000_le_virement_recu_dans_payment.sql`
-- (runbook, « Déployer le virement reçu dans payment (lot D1) »).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LES CLÉS QUI TRAVERSENT — retirées avant le déménagement
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."order_collection" DROP CONSTRAINT "order_collection_bank_transfer_id_fkey";
ALTER TABLE "public"."received_bank_transfer" DROP CONSTRAINT "received_bank_transfer_legal_entity_id_fkey";
ALTER TABLE "public"."received_bank_transfer_invoice" DROP CONSTRAINT "received_bank_transfer_invoice_invoice_id_fkey";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. L'AJOUT SEUL — les déclencheurs et leur fonction `public.` retirés
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER "received_bank_transfer_append_only" ON "public"."received_bank_transfer";
DROP TRIGGER "received_bank_transfer_invoice_append_only" ON "public"."received_bank_transfer_invoice";
DROP FUNCTION "public"."received_bank_transfer_append_only"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE VIREMENT — `payment.transfer_received`
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."received_bank_transfer" SET SCHEMA "payment";
ALTER TABLE "payment"."received_bank_transfer" RENAME TO "transfer_received";
ALTER TABLE "payment"."transfer_received" RENAME COLUMN "legal_entity_id" TO "received_into";
ALTER TABLE "payment"."transfer_received" RENAME COLUMN "payer_company_id" TO "payer_ref";

ALTER TABLE "payment"."transfer_received" RENAME CONSTRAINT "received_bank_transfer_pkey" TO "transfer_received_pkey";
ALTER TABLE "payment"."transfer_received" RENAME CONSTRAINT "received_bank_transfer_amount" TO "transfer_received_amount";
ALTER TABLE "payment"."transfer_received" RENAME CONSTRAINT "received_bank_transfer_reference" TO "transfer_received_reference";
ALTER INDEX "payment"."received_bank_transfer_legal_entity_id_payer_company_id_idx"
    RENAME TO "transfer_received_received_into_payer_ref_idx";

-- Le contrôle de cohérence lit les virements enregistrés depuis un instant.
CREATE INDEX "transfer_received_recorded_at_idx" ON "payment"."transfer_received" ("recorded_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SES PARTS — `payment.transfer_allocation`
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."received_bank_transfer_invoice" SET SCHEMA "payment";
ALTER TABLE "payment"."received_bank_transfer_invoice" RENAME TO "transfer_allocation";
ALTER TABLE "payment"."transfer_allocation" RENAME COLUMN "invoice_id" TO "subject_id";
ALTER TABLE "payment"."transfer_allocation" ADD COLUMN "subject_type" TEXT NOT NULL DEFAULT 'invoice';
ALTER TABLE "payment"."transfer_allocation" ALTER COLUMN "subject_type" DROP DEFAULT;

-- Un sujet n'est réglé que par UN virement : l'unique passe de `invoice_id`
-- au couple (type, id), et la clé primaire prend le type.
DROP INDEX "payment"."received_bank_transfer_invoice_invoice_id_key";
ALTER TABLE "payment"."transfer_allocation" DROP CONSTRAINT "received_bank_transfer_invoice_pkey";
ALTER TABLE "payment"."transfer_allocation"
    ADD CONSTRAINT "transfer_allocation_pkey" PRIMARY KEY ("transfer_id", "subject_type", "subject_id");
CREATE UNIQUE INDEX "transfer_allocation_subject_type_subject_id_key"
    ON "payment"."transfer_allocation" ("subject_type", "subject_id");

ALTER TABLE "payment"."transfer_allocation" RENAME CONSTRAINT "received_bank_transfer_invoice_amount" TO "transfer_allocation_amount";
ALTER TABLE "payment"."transfer_allocation" RENAME CONSTRAINT "received_bank_transfer_invoice_transfer_id_fkey" TO "transfer_allocation_transfer_id_fkey";

-- Le seul type de sujet qu'un virement règle aujourd'hui. Un type de plus est
-- une migration : le contrôle de cohérence ne sait relire que la facture.
ALTER TABLE "payment"."transfer_allocation"
    ADD CONSTRAINT "transfer_allocation_subject_type_known" CHECK ("subject_type" IN ('invoice'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. L'AJOUT SEUL, rebranché dans `payment`
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION "payment"."transfer_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'payment.% : un virement reçu ne se modifie ni ne s''efface (le contrôle de cohérence compare ce qui est écrit, il ne le retouche pas).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transfer_received_append_only"
    BEFORE UPDATE OR DELETE ON "payment"."transfer_received"
    FOR EACH ROW EXECUTE FUNCTION "payment"."transfer_append_only"();

CREATE TRIGGER "transfer_allocation_append_only"
    BEFORE UPDATE OR DELETE ON "payment"."transfer_allocation"
    FOR EACH ROW EXECUTE FUNCTION "payment"."transfer_append_only"();
