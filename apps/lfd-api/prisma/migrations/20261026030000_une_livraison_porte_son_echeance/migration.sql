-- UNE LIVRAISON PORTE SON ÉCHÉANCE — Hugo, 2026-10-25, après la même règle
-- pour le retrait (20261025230000_un_retrait_porte_son_creneau) : « on ne
-- peut pas manquer d'échéances ». La passation pose toujours une fenêtre
-- (une tranche, ou une échéance « avant HH:MM ») ; la base le tient
-- désormais aussi.
--
-- Vérifié en production le 2026-10-25, en lecture seule : 0 livraison sans
-- fin de fenêtre. Un brouillon n'est pas visé.
--
-- ADDITIVE. Retour arrière, sans perte :
--   ALTER TABLE "public"."orders" DROP CONSTRAINT "orders_delivery_has_deadline";

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_delivery_has_deadline"
        CHECK (
            "fulfillment_method" <> 'delivery'
            OR "status" = 'draft'
            OR (
                "fulfillment" IS NOT NULL
                AND jsonb_typeof("fulfillment" -> 'window' -> 'value') = 'object'
                AND ("fulfillment" -> 'window' -> 'value' ->> 'end') IS NOT NULL
            )
        );
