-- LE RANG AU RETRAIT — plan E7, lot L3d
-- (`documentation/commandes/plan-e7-reliquat-bati.md`, choix 5, 12 et 14) :
-- l'attestation de retrait, la garde passée au livreur et les pièces d'une
-- remise à la porte se tiennent par ENVOI `(commande, rang)`. Le rang 1 est la
-- commande elle-même, défaut de toutes les lignes écrites ; le comportement
-- par envoi (référence `-2`, panneau à deux envois) est le lot L4.
--
-- Aucune clé étrangère ne vise ces trois tables ni n'en part : `order_id` y
-- est OPAQUE (migrations `20260907240000`, `20261001160000`,
-- `20261001170000`). Il n'y a donc aucune FK à tomber ni à recréer, et aucun
-- comportement ON DELETE / ON UPDATE à conserver.
--
-- Aucune donnée supprimée, réécrite ni recopiée : chaque ligne existante prend
-- rank = 1, et chaque nouvelle clé contient l'ancienne, donc elle tient dès sa
-- pose. `order_handover.reference` reste unique sur toute la table.
--
-- RETOUR ARRIÈRE, sans perte tant qu'aucune ligne de rang > 1 n'a été écrite
-- (sinon les anciennes clés refuseraient de se reposer — c'est voulu) :
--   ALTER TABLE "production"."order_handover_proof" DROP CONSTRAINT "order_handover_proof_pkey";
--   ALTER TABLE "production"."order_handover_proof" ADD CONSTRAINT "order_handover_proof_pkey" PRIMARY KEY ("order_id");
--   ALTER TABLE "production"."order_handover_proof" DROP COLUMN "rank";
--   ALTER TABLE "production"."order_departure" DROP CONSTRAINT "order_departure_pkey";
--   ALTER TABLE "production"."order_departure" ADD CONSTRAINT "order_departure_pkey" PRIMARY KEY ("order_id");
--   ALTER TABLE "production"."order_departure" DROP COLUMN "rank";
--   DROP INDEX "production"."order_handover_order_id_rank_key";
--   CREATE UNIQUE INDEX "order_handover_order_id_key" ON "production"."order_handover" ("order_id");
--   ALTER TABLE "production"."order_handover" DROP COLUMN "rank";

-- 1. L'attestation : une remise par envoi. L'unicité de la référence ne bouge pas.
ALTER TABLE "production"."order_handover"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "order_handover_rank_check" CHECK ("rank" >= 1);

DROP INDEX "production"."order_handover_order_id_key";
CREATE UNIQUE INDEX "order_handover_order_id_rank_key"
    ON "production"."order_handover" ("order_id", "rank");

-- 2. La garde passée au livreur : une ligne par envoi.
ALTER TABLE "production"."order_departure"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "order_departure_rank_check" CHECK ("rank" >= 1);

ALTER TABLE "production"."order_departure" DROP CONSTRAINT "order_departure_pkey";
ALTER TABLE "production"."order_departure"
    ADD CONSTRAINT "order_departure_pkey" PRIMARY KEY ("order_id", "rank");

-- 3. Les pièces d'une remise à la porte : une preuve par envoi.
ALTER TABLE "production"."order_handover_proof"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "order_handover_proof_rank_check" CHECK ("rank" >= 1);

ALTER TABLE "production"."order_handover_proof" DROP CONSTRAINT "order_handover_proof_pkey";
ALTER TABLE "production"."order_handover_proof"
    ADD CONSTRAINT "order_handover_proof_pkey" PRIMARY KEY ("order_id", "rank");
