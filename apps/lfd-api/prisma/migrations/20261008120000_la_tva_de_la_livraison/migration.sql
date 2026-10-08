-- LA TVA DE LA LIVRAISON — `public.order_delivery_vat` et `orders.delivery_vat_mode`
--
-- Plan `documentation/order/plan-tva-des-frais-de-port.md`, V2 et V3 (décision
-- du 2026-09-21, réglage global le 2026-10-08). Le comptable choisit entre le
-- taux normal (`standard`) et la ventilation du port au prorata des
-- marchandises (`follows_goods`).
--
-- Une table à elle, sur le modèle d'`order_late_fee` : une ligne, et une seule,
-- tenue par un CHECK. Elle naît VIDE : le lecteur rend `standard` faute de
-- ligne — ce que toute commande a toujours fait. Un DEFAULT ne jouerait pas sur
-- une ligne absente.
--
-- La colonne de commande est NULLABLE et sans reprise : `NULL` = commande
-- passée avant le réglage = taux normal.
--
-- ⚠️ Les valeurs `standard` et `follows_goods` deviennent persistées : les
-- renommer plus tard sera une migration de données.
--
-- Purement additive. Aucun droit accordé (`b2b_accounting` existe déjà).
-- Retour arrière : supprimer la colonne, puis la table.

SET lock_timeout = '5s';

CREATE TABLE "public"."order_delivery_vat" (
    "id"         TEXT NOT NULL,
    "mode"       TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "order_delivery_vat_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."order_delivery_vat"
    ADD CONSTRAINT "order_delivery_vat_singleton" CHECK ("id" = 'singleton');

ALTER TABLE "public"."order_delivery_vat"
    ADD CONSTRAINT "order_delivery_vat_mode_known" CHECK ("mode" IN ('standard', 'follows_goods'));

ALTER TABLE "public"."orders"
    ADD COLUMN "delivery_vat_mode" TEXT;

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_delivery_vat_mode_known"
    CHECK ("delivery_vat_mode" IS NULL OR "delivery_vat_mode" IN ('standard', 'follows_goods'));
