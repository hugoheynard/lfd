-- UN RETRAIT PORTE SON CRÉNEAU — Hugo, 2026-10-25 : « ça devrait être
-- mécaniquement impossible ». La passation le refuse depuis le 2026-10-14,
-- mais seul le code le tenait : le semis posait une commande puis effaçait
-- sa tranche en base (`historicWithoutWindow`, retiré le même jour).
--
-- Vérifié en production le 2026-10-25, en lecture seule : 0 retrait sans
-- créneau. Un brouillon n'est pas visé : sa tranche se choisit avant la
-- passation.
--
-- ADDITIVE. Retour arrière, sans perte :
--   ALTER TABLE "public"."orders" DROP CONSTRAINT "orders_pickup_has_window";

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_pickup_has_window"
        CHECK (
            "fulfillment_method" <> 'pickup'
            OR "status" = 'draft'
            OR (
                "fulfillment" IS NOT NULL
                AND jsonb_typeof("fulfillment" -> 'window' -> 'value') = 'object'
            )
        );
