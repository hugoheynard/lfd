-- LE MANQUE SIGNALÉ — lot E6a de
-- documentation/commandes/plan-e6-le-depart-incomplet.md (§ 3).
--
-- Schéma seulement : AUCUNE donnée écrite. Toutes les colonnes naissent
-- nulles : aucune commande, aucun bac n'a encore de manque signalé.
--
-- Côté COLISAGE, `packing.packing_order.shortfall_reported_at` : le bac sait
-- qu'un manque a été signalé, pour publier son effacement quand il se ferme
-- complet (`packing.shortfall_cleared`).
--
-- Côté COMMERCE, sur `public.orders` — le snapshot du fait, jamais une lecture
-- du colisage :
--   - `shortfall_reported_at` : l'instant du signalement en vigueur ; non nul
--     = « Manque signalé — décision attendue » ;
--   - `shortfall_lines` : les quantités au bac par article, telles que le
--     signalement les a figées — un jsonb remplacé d'un bloc, jamais lu ligne
--     à ligne en SQL (une table n'apporterait rien qu'une jointure de plus) ;
--   - `shortfall_cleared_at` : l'instant du dernier effacement, pour qu'un
--     fait plus ancien livré en retard ne ressuscite pas un signal effacé.
--
-- Un CHECK tient la paire : l'instant et les quantités vont ensemble.
--
-- ADDITIVE. Retour arrière : supprimer la contrainte, puis les quatre colonnes.

ALTER TABLE "packing"."packing_order"
    ADD COLUMN "shortfall_reported_at" TIMESTAMPTZ(6);

ALTER TABLE "public"."orders"
    ADD COLUMN "shortfall_reported_at" TIMESTAMPTZ(6),
    ADD COLUMN "shortfall_lines" JSONB,
    ADD COLUMN "shortfall_cleared_at" TIMESTAMPTZ(6);

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_shortfall_reported_with_lines"
        CHECK (("shortfall_reported_at" IS NULL) = ("shortfall_lines" IS NULL));
