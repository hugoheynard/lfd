-- LE PRÉFIXE DE NUMÉRO ET LE RANG LIÉ AU COMPTEUR — lot ZA de
-- documentation/comptabilite/facturation/plan-zero-faille.md (F14, §5, §8,
-- §10 ; décisions de Hugo du 2026-10-22).
--
-- 1. `legal_entities.invoice_prefix` : 2 à 6 lettres majuscules (CHECK),
--    unique entre entités, NULL tant qu'il n'est pas posé ; il ne change plus
--    dès qu'une `invoice` de l'entité existe (déclencheur
--    `legal_entity_invoice_prefix_frozen`).
-- 2. `invoice.invoice_prefix` : la recopie du préfixe de l'entité à
--    l'émission — un CHECK ne lit pas une autre table. `invoice_number_shape`
--    est REMPLACÉE : `FA-<préfixe>-<année>-<rang sur 6>`. Un déclencheur
--    refuse une pièce dont le préfixe n'est pas celui de son entité
--    (`invoice_prefix_of_entity`, la ligne de l'entité lue `FOR SHARE`).
-- 3. Le rang lié au compteur : une pièce n'entre que sous le rang que le
--    compteur (entité, année) vient d'atteindre (`invoice_rank_from_counter`),
--    et un compteur ne finit pas sa transaction sans la pièce de son dernier
--    rang (`invoice_number_counter_has_invoice`, différé au COMMIT). Avec
--    `invoice_number_counter_monotonic` (+1 seulement, E2), « aucun trou »
--    tient en base et plus seulement dans le code.
--
-- PAS ENTIÈREMENT ADDITIVE, et c'est délibéré : `invoice_number_shape` est
-- remplacée et `invoice.invoice_prefix` naît NOT NULL sans défaut. Les deux ne
-- sont sûrs que sur une table VIDE — la production n'a émis aucune pièce (lu
-- par Hugo le 2026-10-22). La migration le VÉRIFIE et refuse sinon : elle ne
-- réécrit jamais un numéro émis.
--
-- Aucune donnée convertie, aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (tant qu'aucune pièce n'est émise) : supprimer les
-- trois déclencheurs et leurs fonctions, rétablir l'ancienne
-- `invoice_number_shape`, `DROP COLUMN "invoice"."invoice_prefix"`, puis
-- l'index, le CHECK et la colonne de `legal_entities`. Après la première
-- émission : NE PAS le faire — les numéros émis portent le préfixe.

SET lock_timeout = '5s';

-- 0. La garde : aucune pièce, aucun compteur.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "invoice") OR EXISTS (SELECT 1 FROM "invoice_number_counter") THEN
        RAISE EXCEPTION 'le_prefixe_de_numero: des factures ou des compteurs existent déjà ; cette migration ne réécrit pas un numéro émis — la reprendre pour une base qui a facturé';
    END IF;
END;
$$;

-- 1. Le préfixe de l'entité.
ALTER TABLE "legal_entities" ADD COLUMN "invoice_prefix" TEXT;
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_invoice_prefix_shape"
    CHECK ("invoice_prefix" IS NULL OR "invoice_prefix" ~ '^[A-Z]{2,6}$');
CREATE UNIQUE INDEX "legal_entities_invoice_prefix_key" ON "legal_entities"("invoice_prefix");

-- Gelé dès la première pièce. Le verrou de ligne pris par l'UPDATE précède ce
-- déclencheur : une émission en cours (qui tient la ligne `FOR SHARE`) le fait
-- attendre, et sa pièce, validée, est alors vue ici.
CREATE FUNCTION "legal_entity_invoice_prefix_frozen"() RETURNS trigger AS $$
BEGIN
    IF NEW."invoice_prefix" IS DISTINCT FROM OLD."invoice_prefix"
        AND EXISTS (SELECT 1 FROM "invoice" WHERE "legal_entity_id" = OLD."id") THEN
        RAISE EXCEPTION 'legal_entity_invoice_prefix_frozen: l''entité % a déjà émis sous le préfixe %, il ne devient pas %', OLD."id", OLD."invoice_prefix", NEW."invoice_prefix";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "legal_entity_invoice_prefix_frozen"
    BEFORE UPDATE ON "legal_entities"
    FOR EACH ROW EXECUTE FUNCTION "legal_entity_invoice_prefix_frozen"();

-- 2. La recopie sur la pièce, et la forme du numéro.
ALTER TABLE "invoice" ADD COLUMN "invoice_prefix" TEXT NOT NULL;
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_number_shape";
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_number_shape" CHECK (
    "rank" BETWEEN 1 AND 999999
    AND "invoice_prefix" ~ '^[A-Z]{2,6}$'
    AND "number" = 'FA-' || "invoice_prefix" || '-' || "year"::text || '-' || lpad("rank"::text, 6, '0')
);

CREATE FUNCTION "invoice_prefix_of_entity"() RETURNS trigger AS $$
DECLARE
    entity_prefix TEXT;
BEGIN
    SELECT "invoice_prefix" INTO entity_prefix
        FROM "legal_entities" WHERE "id" = NEW."legal_entity_id"
        FOR SHARE;
    IF entity_prefix IS DISTINCT FROM NEW."invoice_prefix" THEN
        RAISE EXCEPTION 'invoice_prefix_of_entity: la pièce % porte le préfixe %, son entité % numérote sous %', NEW."number", NEW."invoice_prefix", NEW."legal_entity_id", entity_prefix;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_prefix_of_entity"
    BEFORE INSERT ON "invoice"
    FOR EACH ROW EXECUTE FUNCTION "invoice_prefix_of_entity"();

-- 3. Le rang lié au compteur.
CREATE FUNCTION "invoice_rank_from_counter"() RETURNS trigger AS $$
DECLARE
    counter_rank INTEGER;
BEGIN
    SELECT "last_rank" INTO counter_rank
        FROM "invoice_number_counter"
        WHERE "legal_entity_id" = NEW."legal_entity_id" AND "year" = NEW."year";
    IF counter_rank IS NULL OR NEW."rank" <> counter_rank THEN
        RAISE EXCEPTION 'invoice_rank_from_counter: la pièce % prend le rang %, le compteur %/% est à %', NEW."number", NEW."rank", NEW."legal_entity_id", NEW."year", counter_rank;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_rank_from_counter"
    BEFORE INSERT ON "invoice"
    FOR EACH ROW EXECUTE FUNCTION "invoice_rank_from_counter"();

-- Différé : le compteur avance AVANT que la pièce soit écrite, dans la même
-- transaction ; c'est au COMMIT que la pièce de son dernier rang doit exister.
CREATE FUNCTION "invoice_number_counter_has_invoice"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "invoice"
        WHERE "legal_entity_id" = NEW."legal_entity_id"
            AND "year" = NEW."year" AND "rank" = NEW."last_rank"
    ) THEN
        RAISE EXCEPTION 'invoice_number_counter_has_invoice: le compteur %/% a pris le rang % sans écrire sa pièce — un trou', NEW."legal_entity_id", NEW."year", NEW."last_rank";
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "invoice_number_counter_has_invoice"
    AFTER INSERT OR UPDATE ON "invoice_number_counter"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "invoice_number_counter_has_invoice"();
