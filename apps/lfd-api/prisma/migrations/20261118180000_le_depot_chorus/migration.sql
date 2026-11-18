-- LE DÉPÔT SUR CHORUS PRO, À LA MAIN — lot P3 de
-- documentation/comptabilite/facturation/plan-clients-publics-chorus.md
-- (§ 6 quinquies, T2′).
--
-- ADDITIVE : une table neuve, aucune donnée écrite, aucune colonne touchée.
--
-- `invoice_chorus_deposit` : le journal du dépôt d'une facture d'organisme
-- public sur Chorus Pro — déposée, rejetée, mise en paiement. APPEND-ONLY :
-- une ligne ne se modifie ni ne s'efface (déclencheur). L'agrégat
-- `ChorusDeposit` décide de l'ordre ; l'index unique (facture, sorte) ferme
-- la course de deux gestes concurrents.
--
-- Retour arrière : `prisma/rollback/20261118180000_le_depot_chorus.sql`.

CREATE TABLE "public"."invoice_chorus_deposit" (
    "id"          TEXT           NOT NULL,
    "invoice_id"  TEXT           NOT NULL,
    "kind"        TEXT           NOT NULL,
    "occurred_on" DATE           NOT NULL,
    "reason"      TEXT,
    "staff_id"    TEXT           NOT NULL,
    "staff_name"  TEXT,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "invoice_chorus_deposit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_chorus_deposit_kind" CHECK ("kind" IN ('deposited', 'rejected', 'accepted')),
    CONSTRAINT "invoice_chorus_deposit_reason" CHECK (
        ("kind" = 'rejected') = ("reason" IS NOT NULL AND length(btrim("reason")) > 0)
    )
);

ALTER TABLE "public"."invoice_chorus_deposit"
    ADD CONSTRAINT "invoice_chorus_deposit_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "invoice_chorus_deposit_invoice_id_kind_key"
    ON "public"."invoice_chorus_deposit" ("invoice_id", "kind");

CREATE FUNCTION "public"."invoice_chorus_deposit_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'invoice_chorus_deposit_append_only: le dépôt Chorus d''une facture ne se modifie ni ne s''efface (%)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_chorus_deposit_append_only"
    BEFORE UPDATE OR DELETE ON "public"."invoice_chorus_deposit"
    FOR EACH ROW EXECUTE FUNCTION "public"."invoice_chorus_deposit_append_only"();
