-- LE VIREMENT REÇU — lot T3 de
-- documentation/comptabilite/plan-paiement-au-compte-par-virement.md (V7).
--
-- ADDITIVE : deux tables neuves, une colonne nullable et un CHECK sur
-- `order_collection`. Aucune donnée écrite.
--
-- 1. `received_bank_transfer` : un virement saisi depuis le relevé (montant
--    en centimes, jour de réception, référence lue, auteur). APPEND-ONLY : il
--    ne se modifie ni ne s'efface.
-- 2. `received_bank_transfer_invoice` : les factures qu'il règle et le reste
--    dû de chacune. Une facture n'est réglée que par UN virement (unique).
-- 3. `order_collection.bank_transfer_id` : le virement d'une commande
--    `settled_by_transfer`, posé ⇔ cet état.
--
-- Retour arrière : `prisma/rollback/20261112170100_le_virement_recu.sql`.

CREATE TABLE "public"."received_bank_transfer" (
    "id"                   TEXT           NOT NULL,
    "legal_entity_id"      TEXT           NOT NULL,
    "payer_company_id"     TEXT           NOT NULL,
    "amount_cents"         INTEGER        NOT NULL,
    "received_on"          DATE           NOT NULL,
    "reference"            TEXT           NOT NULL,
    "recorded_at"          TIMESTAMPTZ(3) NOT NULL,
    "recorded_by_staff_id" TEXT           NOT NULL,
    CONSTRAINT "received_bank_transfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "received_bank_transfer_amount" CHECK ("amount_cents" > 0),
    CONSTRAINT "received_bank_transfer_reference" CHECK (length(btrim("reference")) > 0)
);

ALTER TABLE "public"."received_bank_transfer"
    ADD CONSTRAINT "received_bank_transfer_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "received_bank_transfer_legal_entity_id_payer_company_id_idx"
    ON "public"."received_bank_transfer" ("legal_entity_id", "payer_company_id");

CREATE TABLE "public"."received_bank_transfer_invoice" (
    "transfer_id"  TEXT    NOT NULL,
    "invoice_id"   TEXT    NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    CONSTRAINT "received_bank_transfer_invoice_pkey" PRIMARY KEY ("transfer_id", "invoice_id"),
    CONSTRAINT "received_bank_transfer_invoice_amount" CHECK ("amount_cents" > 0)
);

CREATE UNIQUE INDEX "received_bank_transfer_invoice_invoice_id_key"
    ON "public"."received_bank_transfer_invoice" ("invoice_id");

ALTER TABLE "public"."received_bank_transfer_invoice"
    ADD CONSTRAINT "received_bank_transfer_invoice_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "public"."received_bank_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."received_bank_transfer_invoice"
    ADD CONSTRAINT "received_bank_transfer_invoice_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

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

ALTER TABLE "public"."order_collection" ADD COLUMN "bank_transfer_id" TEXT;

ALTER TABLE "public"."order_collection"
    ADD CONSTRAINT "order_collection_bank_transfer_id_fkey"
    FOREIGN KEY ("bank_transfer_id") REFERENCES "public"."received_bank_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."order_collection"
    ADD CONSTRAINT "order_collection_settled_by_transfer_cites_it" CHECK (
        ("state" = 'settled_by_transfer') = ("bank_transfer_id" IS NOT NULL)
    );
