-- LE PLAN ARRÊTÉ, VU PAR LA LIVRAISON — `delivery.delivery_day_readiness`
--
-- Plan `documentation/livraisons/plan-composition-automatique.md`, §16.5
-- (CA6a, validé par Hugo le 2026-10-06). L'abonné de la livraison à
-- `production.day_closed` range ici, par journée, l'ENSEMBLE des livraisons
-- que les clôtures lui ont apprises ; il ne calcule rien. L'écran des tournées
-- lit cette ligne pour dire « Plan arrêté ».
--
-- - une ligne par `service_day` (une journée close ne se rouvre pas, S1) ;
-- - `closed_at` NULLABLE : un retirage reçu avant sa clôture (CA6b) créera la
--   ligne sans lui ;
-- - `delivery_order_ids` est un ensemble (union, jamais remplacé).
--
-- Purement additive : une table neuve, aucun droit accordé.
-- Retour arrière : `DROP TABLE "delivery"."delivery_day_readiness"`.

SET lock_timeout = '5s';

CREATE TABLE "delivery"."delivery_day_readiness" (
    "service_day" VARCHAR(10) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "delivery_order_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_day_readiness_pkey" PRIMARY KEY ("service_day")
);
