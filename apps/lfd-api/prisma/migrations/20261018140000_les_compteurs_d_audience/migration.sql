-- LES COMPTEURS D'AUDIENCE ANONYMES (R0 du plan de recommandation, 2026-10-18)
--
-- ADDITIVE : une table neuve dans `growth`, rien d'existant ne bouge.
-- Aucun identifiant de visiteur, de client ni d'IP : (jour, sku, événement,
-- emplacement) -> nombre. Cf. documentation/recommandation-produit/
-- plan-recommandation-de-produits.md, R5 bis.
--
-- RETOUR ARRIÈRE : sans objet pour la donnée servie — la table n'est lue que
-- par la lecture staff des compteurs ; le code précédent l'ignore.

CREATE TABLE "growth"."product_audience_counters" (
    "day" DATE NOT NULL,
    "sku" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'none',
    "count" INTEGER NOT NULL,

    CONSTRAINT "product_audience_counters_pkey" PRIMARY KEY ("day", "sku", "event", "placement"),
    CONSTRAINT "product_audience_counters_event_check"
        CHECK ("event" IN ('product_viewed', 'added_to_cart', 'suggestion_shown', 'suggestion_clicked', 'suggestion_added')),
    -- Une vue ou un ajout hors suggestion n'a pas d'emplacement ; une suggestion en a un.
    CONSTRAINT "product_audience_counters_placement_check"
        CHECK (("event" IN ('product_viewed', 'added_to_cart')) = ("placement" = 'none')),
    CONSTRAINT "product_audience_counters_count_check" CHECK ("count" > 0)
);

CREATE INDEX "product_audience_counters_day_idx"
    ON "growth"."product_audience_counters"("day");
