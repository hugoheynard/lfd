-- Le numéro de commande court : `ORD-<n>` (plan
-- `documentation/commandes/plan-numero-de-commande-court.md`, R1–R3).
--
-- Additive : une table d'une ligne, le dernier rang attribué. Un seul
-- compteur pour toute la plateforme, jamais remis à zéro. Il est pris dans la
-- transaction de la passation par `INSERT … ON CONFLICT DO UPDATE …
-- RETURNING`, comme celui des factures (lot ZA) : la ligne reste verrouillée
-- jusqu'au COMMIT, une passation concurrente attend et prend le rang suivant.
-- Pas de semis : la première passation crée la ligne au rang 1. Les commandes
-- déjà passées gardent leur `ORD-…` à deux tirets — aucune réécriture.
CREATE TABLE "order_number_counter" (
    -- Toujours TRUE : la clé ne laisse exister qu'une ligne.
    "singleton" BOOLEAN NOT NULL DEFAULT TRUE,
    "last_rank" INTEGER NOT NULL,

    CONSTRAINT "order_number_counter_pkey" PRIMARY KEY ("singleton"),
    CONSTRAINT "order_number_counter_singleton" CHECK ("singleton"),
    CONSTRAINT "order_number_counter_rank" CHECK ("last_rank" >= 1)
);

-- Le compteur ne recule pas et ne se supprime pas : un rang rendu ressortirait
-- sur une seconde commande, et `order_number` est unique.
CREATE FUNCTION "order_number_counter_forward"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'order_number_counter_forward: le compteur des numéros de commande ne se supprime pas';
    END IF;
    IF NEW."last_rank" <= OLD."last_rank" THEN
        RAISE EXCEPTION 'order_number_counter_forward: le compteur est au rang %, il ne revient pas au rang %', OLD."last_rank", NEW."last_rank";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_number_counter_forward"
    BEFORE UPDATE OR DELETE ON "order_number_counter"
    FOR EACH ROW EXECUTE FUNCTION "order_number_counter_forward"();
