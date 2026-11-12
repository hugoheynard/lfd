-- LE MOYEN D'ENCAISSEMENT DU PAYEUR — lot T1 de
-- documentation/comptabilite/plan-paiement-au-compte-par-virement.md (V1, V2, C1).
--
-- ADDITIVE : une table neuve, aucune ligne semée. AUCUNE ligne pour un payeur
-- = prélèvement, comme aujourd'hui.
--
-- Son propre historique, APPEND-ONLY comme `payer_billing_mode` : un segment
-- prend effet à une clôture du payeur (lue sur son mode), s'annule avant sa
-- prise d'effet, ne s'efface jamais. Le motif du geste est obligatoire.
--
-- Retour arrière : `prisma/rollback/20261112150100_le_moyen_d_encaissement_du_payeur.sql`.

CREATE TABLE "public"."payer_collection_means" (
    "id"                    TEXT           NOT NULL,
    "legal_entity_id"       TEXT           NOT NULL,
    "payer_company_id"      TEXT           NOT NULL,
    "effective_from"        TIMESTAMPTZ(3) NOT NULL,
    "means"                 TEXT           NOT NULL,
    "reason"                TEXT           NOT NULL,
    "cancelled_at"          TIMESTAMPTZ(3),
    "cancelled_by_staff_id" TEXT,
    "created_at"            TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id"   TEXT           NOT NULL,
    CONSTRAINT "payer_collection_means_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payer_collection_means_means"
        CHECK ("means" IN ('sepa_debit', 'bank_transfer')),
    CONSTRAINT "payer_collection_means_reason"
        CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "payer_collection_means_cancellation"
        CHECK (("cancelled_at" IS NULL) = ("cancelled_by_staff_id" IS NULL))
);

ALTER TABLE "public"."payer_collection_means"
    ADD CONSTRAINT "payer_collection_means_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- `payer_company_id` est OPAQUE, comme `payer_billing_mode.payer_company_id`.
CREATE INDEX "payer_collection_means_entity_payer_effective_from_idx"
    ON "public"."payer_collection_means" ("legal_entity_id", "payer_company_id", "effective_from");

-- Deux segments VIVANTS ne prennent pas effet au même instant : la course
-- entre deux gestes simultanés se tranche en base.
CREATE UNIQUE INDEX "payer_collection_means_live_effective_from_key"
    ON "public"."payer_collection_means" ("legal_entity_id", "payer_company_id", "effective_from")
    WHERE "cancelled_at" IS NULL;

CREATE FUNCTION "public"."payer_collection_means_append_only"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'payer_collection_means_append_only: un moyen de payeur ne s''efface pas (%), il s''annule', OLD."id";
    END IF;
    IF OLD."cancelled_at" IS NOT NULL
        OR NEW."cancelled_at" IS NULL
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."legal_entity_id" IS DISTINCT FROM OLD."legal_entity_id"
        OR NEW."payer_company_id" IS DISTINCT FROM OLD."payer_company_id"
        OR NEW."effective_from" IS DISTINCT FROM OLD."effective_from"
        OR NEW."means" IS DISTINCT FROM OLD."means"
        OR NEW."reason" IS DISTINCT FROM OLD."reason"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
        OR NEW."created_by_staff_id" IS DISTINCT FROM OLD."created_by_staff_id" THEN
        RAISE EXCEPTION 'payer_collection_means_append_only: le segment % ne se modifie pas, seule son annulation se pose, une fois', OLD."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payer_collection_means_append_only"
    BEFORE UPDATE OR DELETE ON "public"."payer_collection_means"
    FOR EACH ROW EXECUTE FUNCTION "public"."payer_collection_means_append_only"();
