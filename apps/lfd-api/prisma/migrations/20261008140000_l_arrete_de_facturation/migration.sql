-- L'ARRÊTÉ DE FACTURATION FIGÉ — lot F3
-- (`documentation/facturation/plan-le-prelevement-suit-la-facture.md`)
--
-- Une ligne de débit prélève le total TTC de la facture calculée en une fois
-- sur ses bons (F2). Cet arrêté FIGE cette facture — identités, lignes, remises,
-- frais, ventilation par taux — pour que la banque, notre facture et demain un
-- logiciel comptable lisent le même chiffre sans le recalculer.
--
-- ADDITIVE : une énumération neuve, deux tables neuves, deux déclencheurs sur
-- ces seules tables. Aucune ligne existante modifiée, aucune colonne resserrée,
-- aucun droit accordé à un rôle. Les lots constitués avant n'ont pas d'arrêté
-- (Q3 du plan) : rien n'est rétro-calculé.
--
-- Retour arrière du SCHÉMA (migration EN AVANT, une fois qu'aucun binaire ne
-- les lit) : `DROP TABLE "billing_statement_order", "billing_statement"`, les
-- deux fonctions, puis `DROP TYPE "BillingStatementStatus"`. Un arrêté d'un lot
-- DÉPOSÉ est une pièce : ne pas le faire après le premier dépôt.

SET lock_timeout = '5s';

CREATE TYPE "BillingStatementStatus" AS ENUM ('active', 'cancelled');

-- 1. L'arrêté : UNE ligne de débit, sa facture figée.
CREATE TABLE "billing_statement" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "line_rank" INTEGER NOT NULL,
    "status" "BillingStatementStatus" NOT NULL,
    "payer_company_id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "issued_on" DATE NOT NULL,
    "period_starts_on" DATE,
    "period_ends_on" DATE,
    "total_ht_cents" INTEGER NOT NULL,
    "total_vat_cents" INTEGER NOT NULL,
    "total_ttc_cents" INTEGER NOT NULL,
    "orders_total_cents" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "body_version" INTEGER NOT NULL,
    "computed_with" TEXT NOT NULL,

    CONSTRAINT "billing_statement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_statement_batch_id_line_rank_fkey"
        FOREIGN KEY ("batch_id", "line_rank") REFERENCES "collection_batch_line"("batch_id", "rank")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Le total TTC est ce que la ligne prélève : strictement positif, comme
    -- `collection_batch_line_amount`, et la somme de ses deux parts.
    CONSTRAINT "billing_statement_totals" CHECK (
        "total_ttc_cents" > 0 AND "total_ttc_cents" = "total_ht_cents" + "total_vat_cents"
    ),
    CONSTRAINT "billing_statement_period" CHECK (
        ("period_starts_on" IS NULL) = ("period_ends_on" IS NULL)
        AND ("period_starts_on" IS NULL OR "period_starts_on" <= "period_ends_on")
    ),
    CONSTRAINT "billing_statement_body_version" CHECK ("body_version" >= 1)
);

-- Un arrêté par ligne : une ligne n'appartient qu'à un lot, et reconstituer
-- crée un AUTRE lot, donc d'autres lignes.
CREATE UNIQUE INDEX "billing_statement_batch_id_line_rank_key"
    ON "billing_statement"("batch_id", "line_rank");
CREATE INDEX "billing_statement_payer_company_id_idx" ON "billing_statement"("payer_company_id");

-- 2. Les bons couverts. `order_id` est OPAQUE : aucune clé étrangère vers
--    `orders`, comme `order_collection`.
CREATE TABLE "billing_statement_order" (
    "statement_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,

    CONSTRAINT "billing_statement_order_pkey" PRIMARY KEY ("statement_id", "order_id"),
    CONSTRAINT "billing_statement_order_statement_id_fkey"
        FOREIGN KEY ("statement_id") REFERENCES "billing_statement"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "billing_statement_order_order_id_idx" ON "billing_statement_order"("order_id");

-- 3. Immuable PAR CONSTRUCTION. Le port n'a qu'`insert` et `cancelForBatch` ;
--    la base le tient pour tout autre écrivain. Un arrêté ne se supprime pas,
--    ne change que de `active` à `cancelled`, et seulement tant que son lot
--    est `constituted` : une fois le lot déposé, l'arrêté est une pièce.
--    (`TRUNCATE` ne déclenche pas un déclencheur de ligne : la remise à zéro
--    des e2e n'est pas concernée.)
CREATE FUNCTION "billing_statement_immutable"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'billing_statement_immutable: l''arrêté % ne se supprime pas, il s''annule avec son lot', OLD."id";
    END IF;
    IF OLD."status" <> 'active' OR NEW."status" <> 'cancelled'
        OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
        RAISE EXCEPTION 'billing_statement_immutable: l''arrêté % ne change que de active à cancelled', OLD."id";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "collection_batch"
        WHERE "id" = OLD."batch_id" AND "status" = 'constituted'
    ) THEN
        RAISE EXCEPTION 'billing_statement_immutable: le lot % n''est plus constitué, son arrêté % ne s''annule plus', OLD."batch_id", OLD."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "billing_statement_immutable"
    BEFORE UPDATE OR DELETE ON "billing_statement"
    FOR EACH ROW EXECUTE FUNCTION "billing_statement_immutable"();

CREATE FUNCTION "billing_statement_order_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'billing_statement_order_immutable: les bons d''un arrêté ne se retouchent pas (%)', OLD."statement_id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "billing_statement_order_immutable"
    BEFORE UPDATE OR DELETE ON "billing_statement_order"
    FOR EACH ROW EXECUTE FUNCTION "billing_statement_order_immutable"();
