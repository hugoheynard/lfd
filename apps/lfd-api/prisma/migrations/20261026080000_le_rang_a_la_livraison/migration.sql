-- LE RANG À LA LIVRAISON — plan E7, lot L3c
-- (`documentation/commandes/plan-e7-reliquat-bati.md`, choix 5 et 12) :
-- un arrêt de livraison dessert un ENVOI `(commande, rang)`. Le rang 1 est la
-- commande elle-même, défaut de toutes les lignes écrites ; un reliquat livré
-- aura son propre arrêt, sa propre exécution et sa propre décision.
--
-- Les trois tables d'arrêt sont clées par l'arrêt (`stop_id`) : aucune clé
-- étrangère ne vise leur commande, donc AUCUNE n'est à défaire ni à recréer
-- ici (lu le 2026-10-26 dans `20260929140200_les_tournees`,
-- `20260929160200_les_sacs_et_le_depart`, `20261001190000_la_decision_du_commercial`).
-- Seul l'index unique partiel I3 (« une commande dans au plus une tournée
-- vivante », `20260929140200`, l.80) devient « un ENVOI dans au plus une
-- tournée vivante » ; son prédicat est recopié tel quel.
--
-- La liste du plan arrêté (`delivery_day_readiness.delivery_order_ids`) passe
-- dans une table fille par envoi ; chaque identifiant déjà rangé y est recopié
-- au rang 1. La colonne reste en base, morte (CLAUDE.md §0 : pas de
-- suppression en production) — plus lue ni écrite par le code.
--
-- Aucune donnée supprimée. Un seul fichier, une transaction (Prisma).
--
-- RETOUR ARRIÈRE, sans perte tant qu'aucune ligne de rang > 1 n'a été écrite
-- (sinon l'ancien index refuserait de se reposer — c'est voulu). La liste
-- d'abord, parce que l'ancien code ne lit que la colonne :
--   UPDATE "delivery"."delivery_day_readiness" r
--      SET "delivery_order_ids" = COALESCE((
--          SELECT array_agg(DISTINCT s."order_id" ORDER BY s."order_id")
--            FROM "delivery"."delivery_day_readiness_shipment" s
--           WHERE s."service_day" = r."service_day"), ARRAY[]::TEXT[]);
--   DROP TABLE "delivery"."delivery_day_readiness_shipment";
--   ALTER TABLE "delivery"."stop_decision" DROP COLUMN "rank";
--   ALTER TABLE "delivery"."delivery_stop_execution" DROP COLUMN "rank";
--   DROP INDEX "delivery"."delivery_round_stop_live_order_key";
--   CREATE UNIQUE INDEX "delivery_round_stop_live_order_key"
--       ON "delivery"."delivery_round_stop"("order_id")
--       WHERE "removed_at" IS NULL AND "closed_at" IS NULL;
--   ALTER TABLE "delivery"."delivery_round_stop" DROP COLUMN "rank";

SET lock_timeout = '5s';

-- 1. L'arrêt : la colonne, puis l'index I3 recréé avec le rang. Un arrêt de
-- transfert prend le défaut, sans effet : l'index ignore son `order_id` nul.
ALTER TABLE "delivery"."delivery_round_stop"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "delivery_round_stop_rank_check" CHECK ("rank" >= 1);

DROP INDEX "delivery"."delivery_round_stop_live_order_key";
CREATE UNIQUE INDEX "delivery_round_stop_live_order_key"
    ON "delivery"."delivery_round_stop"("order_id", "rank")
    WHERE "removed_at" IS NULL AND "closed_at" IS NULL;

-- 2. Ce qui est figé au départ, et la décision : le rang de leur arrêt.
ALTER TABLE "delivery"."delivery_stop_execution"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "delivery_stop_execution_rank_check" CHECK ("rank" >= 1);
ALTER TABLE "delivery"."stop_decision"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "stop_decision_rank_check" CHECK ("rank" >= 1);

-- 3. Le plan arrêté, par envoi. La clé étrangère suit la convention de
-- Prisma (RESTRICT / CASCADE) : une journée ne se supprime pas.
CREATE TABLE "delivery"."delivery_day_readiness_shipment" (
    "service_day" VARCHAR(10) NOT NULL,
    "order_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "delivery_day_readiness_shipment_pkey" PRIMARY KEY ("service_day", "order_id", "rank"),
    CONSTRAINT "delivery_day_readiness_shipment_rank_check" CHECK ("rank" >= 1)
);

ALTER TABLE "delivery"."delivery_day_readiness_shipment"
    ADD CONSTRAINT "delivery_day_readiness_shipment_service_day_fkey"
    FOREIGN KEY ("service_day") REFERENCES "delivery"."delivery_day_readiness"("service_day")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. La recopie : chaque commande déjà rangée devient l'envoi de rang 1.
INSERT INTO "delivery"."delivery_day_readiness_shipment" ("service_day", "order_id", "rank")
SELECT DISTINCT r."service_day", ids."order_id", 1
  FROM "delivery"."delivery_day_readiness" r
 CROSS JOIN LATERAL unnest(r."delivery_order_ids") AS ids("order_id");
