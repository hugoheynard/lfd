-- LA FACTURE ÉMISE — lot E2
-- (`documentation/facturation/plan-emission-de-la-facture.md`, § 5)
--
-- Trois tables : la facture (et l'avoir), ses bons, et le compteur de
-- numéros par entité et par année. La facture est une PIÈCE : la base refuse
-- de la supprimer et de la modifier, sauf pour y attacher une fois son
-- document rendu ; le compteur n'avance que d'un rang et ne recule jamais.
--
-- ADDITIVE : trois tables neuves, quatre fonctions et leurs déclencheurs sur
-- ces seules tables. Aucune ligne existante modifiée, aucune colonne
-- resserrée, aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (migration EN AVANT, tant qu'aucune facture n'a
-- été émise en production) : `DROP TABLE "invoice_order", "invoice",
-- "invoice_number_counter"` puis les quatre fonctions. Après la première
-- émission réelle : NE PAS le faire — une facture émise se conserve dix ans.

SET lock_timeout = '5s';

-- 1. La facture. `number` se recompose de `year` et `rank` ; `year` est
--    celle de `issued_on` : un numéro d'une autre année est refusé ici aussi.
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "corrects_invoice_id" TEXT,
    "issued_on" DATE NOT NULL,
    "due_on" DATE,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "payer_company_id" TEXT NOT NULL,
    "mentions" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "vat_breakdown" JSONB NOT NULL,
    "total_ht_cents" INTEGER NOT NULL,
    "total_vat_cents" INTEGER NOT NULL,
    "total_ttc_cents" INTEGER NOT NULL,
    "delivery_address" JSONB,
    "body_version" INTEGER NOT NULL,
    "document_key" TEXT,
    "document_sha256" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_legal_entity_id_fkey"
        FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_corrects_invoice_id_fkey"
        FOREIGN KEY ("corrects_invoice_id") REFERENCES "invoice"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_type" CHECK ("type" IN ('380', '381')),
    -- Un avoir corrige une facture ; une facture ne corrige rien.
    CONSTRAINT "invoice_correction" CHECK (("type" = '381') = ("corrects_invoice_id" IS NOT NULL)),
    CONSTRAINT "invoice_number_shape" CHECK (
        "rank" BETWEEN 1 AND 999999
        AND "number" = 'FA-' || "year"::text || '-' || lpad("rank"::text, 6, '0')
    ),
    CONSTRAINT "invoice_number_year" CHECK ("year" = EXTRACT(YEAR FROM "issued_on")::integer),
    -- Échéance au plus tôt le jour d'émission ; un avoir n'en a pas.
    CONSTRAINT "invoice_due_on" CHECK (
        ("due_on" IS NULL OR "due_on" >= "issued_on")
        AND ("type" = '380' OR "due_on" IS NULL)
    ),
    CONSTRAINT "invoice_totals" CHECK (
        "total_ht_cents" >= 0 AND "total_vat_cents" >= 0
        AND "total_ttc_cents" = "total_ht_cents" + "total_vat_cents"
    ),
    -- Le document et son empreinte vont ensemble, ou ne sont pas.
    CONSTRAINT "invoice_document_pair" CHECK (("document_key" IS NULL) = ("document_sha256" IS NULL)),
    CONSTRAINT "invoice_body_version" CHECK ("body_version" >= 1)
);

-- Une seule séquence par entité et par année ; le numéro, lui, est unique
-- dans toute la base (une seule entité encaisse aujourd'hui — plan § 9).
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");
CREATE UNIQUE INDEX "invoice_legal_entity_id_year_rank_key" ON "invoice"("legal_entity_id", "year", "rank");
-- Cible de la clé composite de `invoice_order` : le type du bon suit sa facture.
CREATE UNIQUE INDEX "invoice_id_type_key" ON "invoice"("id", "type");
CREATE INDEX "invoice_payer_company_id_idx" ON "invoice"("payer_company_id");
CREATE INDEX "invoice_corrects_invoice_id_idx" ON "invoice"("corrects_invoice_id");

-- 2. Les bons (BT-13). `order_id` est OPAQUE : aucune clé étrangère vers
--    `orders`, comme `billing_statement_order`.
CREATE TABLE "invoice_order" (
    "invoice_id" TEXT NOT NULL,
    "invoice_type" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "delivered_on" DATE,
    -- Le rang d'écriture du bon sur la pièce : la relecture rend l'ordre émis.
    "position" INTEGER NOT NULL,

    CONSTRAINT "invoice_order_position" CHECK ("position" >= 0),
    CONSTRAINT "invoice_order_pkey" PRIMARY KEY ("invoice_id", "order_id"),
    CONSTRAINT "invoice_order_invoice_id_invoice_type_fkey"
        FOREIGN KEY ("invoice_id", "invoice_type") REFERENCES "invoice"("id", "type")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "invoice_order_order_id_idx" ON "invoice_order"("order_id");
CREATE UNIQUE INDEX "invoice_order_invoice_id_position_key" ON "invoice_order"("invoice_id", "position");

-- Un bon n'est facturé qu'UNE fois. Un avoir ne le libère pas, même total :
-- refacturer un bon après un avoir sera un geste explicite d'un lot ultérieur
-- (qui devra relâcher cet index en connaissance de cause), jamais l'effet de
-- bord d'une compensation.
CREATE UNIQUE INDEX "invoice_order_invoiced_once"
    ON "invoice_order"("order_id") WHERE "invoice_type" = '380';

-- 3. Le compteur : le dernier rang attribué, par entité et par année. Pris
--    dans la transaction de l'émission (`INSERT … ON CONFLICT DO UPDATE`,
--    qui verrouille la ligne) : un rollback rend le rang, aucun trou.
CREATE TABLE "invoice_number_counter" (
    "legal_entity_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_rank" INTEGER NOT NULL,
    -- Le jour d'émission du dernier rang : un rang suivant ne se date pas avant
    -- (numérotation chronologique ET continue).
    "last_issued_on" DATE NOT NULL,

    CONSTRAINT "invoice_number_counter_pkey" PRIMARY KEY ("legal_entity_id", "year"),
    CONSTRAINT "invoice_number_counter_legal_entity_id_fkey"
        FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_number_counter_rank" CHECK ("last_rank" BETWEEN 1 AND 999999)
);

-- 4. Immuable PAR CONSTRUCTION. Le port n'a qu'`insert` et `attachDocument` ;
--    la base le tient pour tout autre écrivain. (`TRUNCATE` ne déclenche pas
--    un déclencheur de ligne : la remise à zéro des e2e n'est pas concernée.)
CREATE FUNCTION "invoice_immutable"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'invoice_immutable: la facture % ne se supprime pas, elle se compense par un avoir', OLD."number";
    END IF;
    IF OLD."document_key" IS NOT NULL
        OR NEW."document_key" IS NULL OR NEW."document_sha256" IS NULL
        OR (to_jsonb(NEW) - 'document_key' - 'document_sha256')
            IS DISTINCT FROM (to_jsonb(OLD) - 'document_key' - 'document_sha256') THEN
        RAISE EXCEPTION 'invoice_immutable: la facture % ne change pas ; seul son document s''attache, une fois', OLD."number";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_immutable"
    BEFORE UPDATE OR DELETE ON "invoice"
    FOR EACH ROW EXECUTE FUNCTION "invoice_immutable"();

CREATE FUNCTION "invoice_order_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'invoice_order_immutable: les bons d''une facture ne se retouchent pas (%)', OLD."invoice_id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_order_immutable"
    BEFORE UPDATE OR DELETE ON "invoice_order"
    FOR EACH ROW EXECUTE FUNCTION "invoice_order_immutable"();

-- Le compteur ne se supprime pas, n'avance que d'un rang à la fois (un rang
-- sauté serait un trou, un rang repris un doublon), et jamais vers un jour
-- antérieur au dernier émis (la séquence est chronologique).
CREATE FUNCTION "invoice_number_counter_monotonic"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'invoice_number_counter_monotonic: le compteur %/% ne se supprime pas', OLD."legal_entity_id", OLD."year";
    END IF;
    IF NEW."legal_entity_id" <> OLD."legal_entity_id" OR NEW."year" <> OLD."year"
        OR NEW."last_rank" <> OLD."last_rank" + 1 THEN
        RAISE EXCEPTION 'invoice_number_counter_monotonic: le compteur %/% n''avance que d''un rang', OLD."legal_entity_id", OLD."year";
    END IF;
    IF NEW."last_issued_on" < OLD."last_issued_on" THEN
        RAISE EXCEPTION 'invoice_number_counter_monotonic: le compteur %/% a déjà émis le %, un rang suivant ne se date pas du %', OLD."legal_entity_id", OLD."year", OLD."last_issued_on", NEW."last_issued_on";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_number_counter_monotonic"
    BEFORE UPDATE OR DELETE ON "invoice_number_counter"
    FOR EACH ROW EXECUTE FUNCTION "invoice_number_counter_monotonic"();

-- Un compteur naît au rang 1 : un premier rang plus haut laisserait un trou.
CREATE FUNCTION "invoice_number_counter_starts_at_one"() RETURNS trigger AS $$
BEGIN
    IF NEW."last_rank" <> 1 THEN
        RAISE EXCEPTION 'invoice_number_counter_starts_at_one: le compteur %/% commence au rang 1', NEW."legal_entity_id", NEW."year";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_number_counter_starts_at_one"
    BEFORE INSERT ON "invoice_number_counter"
    FOR EACH ROW EXECUTE FUNCTION "invoice_number_counter_starts_at_one"();
