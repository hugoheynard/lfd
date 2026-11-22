-- Retour arrière de 20261122180000_le_virement_recu_dans_payment : les deux
-- tables du virement reçu reviennent dans `public` sous leurs noms d'avant,
-- leurs colonnes, clés, index et contraintes aussi ; les trois clés
-- étrangères entre les blocs sont reposées ; l'ajout seul revient à la
-- fonction `public.received_bank_transfer_append_only`.
--
-- À jouer avec l'image d'avant D1, dans une transaction (`psql -1`). La
-- dernière instruction retire D1 du journal de Prisma : sans elle,
-- `migrate deploy` la croirait appliquée.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 0. AVANT TOUT — LES ORPHELINS (aucune ligne attendue)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Les clés reposées plus bas échouent sur une ligne qui cite ce qui n'existe
-- pas. Jouer ces quatre requêtes SEULES d'abord : une ligne rendue arrête le
-- retour arrière, et se regarde avec la comptabilité.
--
-- (a) un sujet qui n'est pas une facture — le retour arrière n'a pas de
--     colonne pour lui :
--   SELECT * FROM "payment"."transfer_allocation" WHERE "subject_type" <> 'invoice';
-- (b) une part qui cite une facture inconnue :
--   SELECT a.* FROM "payment"."transfer_allocation" a
--     LEFT JOIN "public"."invoice" i ON i."id" = a."subject_id"
--    WHERE i."id" IS NULL;
-- (c) un virement reçu sur une entité inconnue :
--   SELECT t.* FROM "payment"."transfer_received" t
--     LEFT JOIN "public"."legal_entities" e ON e."id" = t."received_into"
--    WHERE e."id" IS NULL;
-- (d) un bon qui cite un virement inconnu :
--   SELECT oc.* FROM "public"."order_collection" oc
--     LEFT JOIN "payment"."transfer_received" t ON t."id" = oc."bank_transfer_id"
--    WHERE oc."bank_transfer_id" IS NOT NULL AND t."id" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. L'AJOUT SEUL de `payment` retiré
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER "transfer_received_append_only" ON "payment"."transfer_received";
DROP TRIGGER "transfer_allocation_append_only" ON "payment"."transfer_allocation";
DROP FUNCTION "payment"."transfer_append_only"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LES PARTS — redeviennent `public.received_bank_transfer_invoice`
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "payment"."transfer_allocation" DROP CONSTRAINT "transfer_allocation_subject_type_known";
ALTER TABLE "payment"."transfer_allocation" RENAME CONSTRAINT "transfer_allocation_transfer_id_fkey" TO "received_bank_transfer_invoice_transfer_id_fkey";
ALTER TABLE "payment"."transfer_allocation" RENAME CONSTRAINT "transfer_allocation_amount" TO "received_bank_transfer_invoice_amount";

DROP INDEX "payment"."transfer_allocation_subject_type_subject_id_key";
ALTER TABLE "payment"."transfer_allocation" DROP CONSTRAINT "transfer_allocation_pkey";
ALTER TABLE "payment"."transfer_allocation" DROP COLUMN "subject_type";
ALTER TABLE "payment"."transfer_allocation" RENAME COLUMN "subject_id" TO "invoice_id";
ALTER TABLE "payment"."transfer_allocation"
    ADD CONSTRAINT "received_bank_transfer_invoice_pkey" PRIMARY KEY ("transfer_id", "invoice_id");
CREATE UNIQUE INDEX "received_bank_transfer_invoice_invoice_id_key"
    ON "payment"."transfer_allocation" ("invoice_id");

ALTER TABLE "payment"."transfer_allocation" RENAME TO "received_bank_transfer_invoice";
ALTER TABLE "payment"."received_bank_transfer_invoice" SET SCHEMA "public";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE VIREMENT — redevient `public.received_bank_transfer`
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX "payment"."transfer_received_recorded_at_idx";
ALTER INDEX "payment"."transfer_received_received_into_payer_ref_idx"
    RENAME TO "received_bank_transfer_legal_entity_id_payer_company_id_idx";
ALTER TABLE "payment"."transfer_received" RENAME CONSTRAINT "transfer_received_reference" TO "received_bank_transfer_reference";
ALTER TABLE "payment"."transfer_received" RENAME CONSTRAINT "transfer_received_amount" TO "received_bank_transfer_amount";
ALTER TABLE "payment"."transfer_received" RENAME CONSTRAINT "transfer_received_pkey" TO "received_bank_transfer_pkey";

ALTER TABLE "payment"."transfer_received" RENAME COLUMN "payer_ref" TO "payer_company_id";
ALTER TABLE "payment"."transfer_received" RENAME COLUMN "received_into" TO "legal_entity_id";
ALTER TABLE "payment"."transfer_received" RENAME TO "received_bank_transfer";
ALTER TABLE "payment"."received_bank_transfer" SET SCHEMA "public";

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. L'AJOUT SEUL de `public`, tel que `20261112170100_le_virement_recu` l'a posé
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION "public"."received_bank_transfer_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'received_bank_transfer_append_only: un virement reçu ne se modifie ni ne s''efface (%)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "received_bank_transfer_append_only"
    BEFORE UPDATE OR DELETE ON "public"."received_bank_transfer"
    FOR EACH ROW EXECUTE FUNCTION "public"."received_bank_transfer_append_only"();

CREATE TRIGGER "received_bank_transfer_invoice_append_only"
    BEFORE UPDATE OR DELETE ON "public"."received_bank_transfer_invoice"
    FOR EACH ROW EXECUTE FUNCTION "public"."received_bank_transfer_append_only"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LES TROIS CLÉS ENTRE LES BLOCS — reposées (échouent sur un orphelin, § 0)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."received_bank_transfer_invoice"
    ADD CONSTRAINT "received_bank_transfer_invoice_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."received_bank_transfer"
    ADD CONSTRAINT "received_bank_transfer_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."order_collection"
    ADD CONSTRAINT "order_collection_bank_transfer_id_fkey"
    FOREIGN KEY ("bank_transfer_id") REFERENCES "public"."received_bank_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261122180000_le_virement_recu_dans_payment';
