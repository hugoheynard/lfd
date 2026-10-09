-- L'OUVERTURE DE LA BOUTIQUE À LA COMMANDE — Hugo, 2026-10-09.
-- Doc : `documentation/order/ouverture-de-la-boutique.md`.
--
-- ADDITIVE : une table neuve, à ligne unique (clé `orders`), qu'aucune ligne
-- ne remplit. Ligne absente = ouverte aux deux clientèles : rien ne se ferme
-- au déploiement. Aucun droit accordé à un rôle — l'écran se règle sous la
-- ressource existante `b2b_settings`, comme « Livraison ».
--
-- Retour arrière : `DROP TABLE "public"."order_opening_settings"` — ce qui
-- rouvre la boutique aux deux clientèles : à dire à Hugo avant.

CREATE TABLE "public"."order_opening_settings" (
    "key" TEXT NOT NULL,
    "orders_open_to_b2b" BOOLEAN NOT NULL DEFAULT true,
    "orders_open_to_b2c" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "order_opening_settings_pkey" PRIMARY KEY ("key")
);
