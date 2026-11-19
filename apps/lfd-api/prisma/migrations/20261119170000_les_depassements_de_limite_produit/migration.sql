-- LES DÉPASSEMENTS DE LIMITE DE PRODUIT — plan
-- documentation/limites-de-commande/plan-passer-outre-la-limite-produit.md,
-- § 3.5, lot O4.
--
-- Une ligne par SKU dont l'équipe a passé la limite de commande, écrite dans
-- la transaction de la commande, jamais modifiée. Propriétaire :
-- `lafoliecoffee/orders`. `staff_user_id` et `reason` sont au registre RGPD
-- (`documentation/legal/rgpd-registre.json`), conservés comme la commande.
--
-- ADDITIVE : une table neuve, aucune colonne touchée.
--
-- Réversible tant que personne ne l'a écrite :
--   DROP TABLE "public"."order_item_limit_overrides";

SET lock_timeout = '5s';

CREATE TABLE "public"."order_item_limit_overrides" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "service_day" DATE NOT NULL,
    "days_before" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "limit_at" TIMESTAMPTZ(6) NOT NULL,
    "origin" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_limit_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_item_limit_overrides_origin_check" CHECK ("origin" IN ('placement', 'revision')),
    CONSTRAINT "order_item_limit_overrides_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 280)
);

CREATE INDEX "order_item_limit_overrides_order_id_idx" ON "public"."order_item_limit_overrides"("order_id");

ALTER TABLE "public"."order_item_limit_overrides" ADD CONSTRAINT "order_item_limit_overrides_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
