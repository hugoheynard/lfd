-- LE MANQUE PAR ENVOI — plan E7, lot LB
-- (`documentation/commandes/plan-e7-reliquat-bati.md`, choix 11 et 15) :
-- le manque signalé et sa décision ne sont plus uniques par COMMANDE mais par
-- ENVOI `(commande, rang)`. Un reliquat (rang > 1) peut manquer à son tour, et
-- sa décision est la sienne.
--
-- 🔴 MIGRATION DE DONNÉES. Les quatre colonnes du manque de `orders`
-- (`shortfall_reported_at`, `shortfall_lines`, `shortfall_cleared_at`,
-- `shortfall_decided_at`, migrations `20261025090000` et `20261025140100`)
-- sont RECOPIÉES en lignes de rang 1 de la table neuve `order_shortfall`. Les
-- colonnes restent en base, MORTES — plus lues ni écrites par le code
-- (CLAUDE.md §0 : pas de suppression en production) ; un lot de resserrement,
-- hors du plan E7, les retirera. Toute décision existante est de rang 1
-- (défaut de la colonne neuve) et son signal est recopié : le CHECK
-- `orders_shortfall_decided_on_signal` garantit qu'une commande décidée porte
-- un signalement (`shortfall_reported_at` non nul), donc une ligne à recopier.
--
-- La recopie est IDEMPOTENTE (`ON CONFLICT DO NOTHING` sur la clé primaire) :
-- rejouée, elle n'écrit rien de plus et n'écrase rien.
--
-- Compté le 2026-10-26 en base de dev (`lfc_b2b_dev`, lecture seule) : 0
-- commande portant un manque ou un effacement, 0 décision. Rien à recopier
-- en dev ; la recopie est écrite pour la production.
--
-- Le reste :
--   - `order_shortfall_decision.rank` (défaut 1) ; l'unicité `order_id` devient
--     `(order_id, rank)` ;
--   - une décision désigne le signal qu'elle résout (clé étrangère composite
--     vers `order_shortfall`) : une décision sans manque est inexprimable ;
--   - les deux CHECK d'`orders` sur le manque sont recopiés sur la table
--     neuve, avec `rank >= 1`.
--
-- Aucune donnée supprimée. Un seul fichier, une transaction (Prisma).
--
-- RETOUR ARRIÈRE, sans perte tant qu'aucune ligne de rang > 1 n'a été écrite
-- (sinon l'ancienne unicité refuserait de se reposer — c'est voulu). Le rang 1
-- d'abord, parce que l'ancien code ne lit que les colonnes de `orders` :
--   UPDATE "public"."orders" o
--      SET "shortfall_reported_at" = s."reported_at",
--          "shortfall_lines"       = s."lines",
--          "shortfall_cleared_at"  = s."cleared_at",
--          "shortfall_decided_at"  = s."decided_at"
--     FROM "public"."order_shortfall" s
--    WHERE s."order_id" = o."id" AND s."rank" = 1;
--   ALTER TABLE "public"."order_shortfall_decision"
--       DROP CONSTRAINT "order_shortfall_decision_order_id_rank_fkey";
--   DROP INDEX "public"."order_shortfall_decision_order_id_rank_key";
--   CREATE UNIQUE INDEX "order_shortfall_decision_order_id_key"
--       ON "public"."order_shortfall_decision"("order_id");
--   ALTER TABLE "public"."order_shortfall_decision" DROP COLUMN "rank";
--   DROP TABLE "public"."order_shortfall";

SET lock_timeout = '5s';

-- 1. La table neuve, ses CHECK (ceux d'`orders`, recopiés) et sa commande.
CREATE TABLE "public"."order_shortfall" (
    "order_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "reported_at" TIMESTAMPTZ(6),
    "lines" JSONB,
    "cleared_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_shortfall_pkey" PRIMARY KEY ("order_id", "rank"),
    CONSTRAINT "order_shortfall_rank_check" CHECK ("rank" >= 1),
    CONSTRAINT "order_shortfall_reported_with_lines"
        CHECK (("reported_at" IS NULL) = ("lines" IS NULL)),
    CONSTRAINT "order_shortfall_decided_on_signal"
        CHECK ("decided_at" IS NULL OR "reported_at" IS NOT NULL)
);

ALTER TABLE "public"."order_shortfall"
    ADD CONSTRAINT "order_shortfall_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. La recopie : le manque de chaque commande devient celui de son rang 1.
INSERT INTO "public"."order_shortfall"
    ("order_id", "rank", "reported_at", "lines", "cleared_at", "decided_at")
SELECT o."id", 1, o."shortfall_reported_at", o."shortfall_lines",
       o."shortfall_cleared_at", o."shortfall_decided_at"
  FROM "public"."orders" o
 WHERE o."shortfall_reported_at" IS NOT NULL
    OR o."shortfall_cleared_at" IS NOT NULL
    OR o."shortfall_decided_at" IS NOT NULL
ON CONFLICT ("order_id", "rank") DO NOTHING;

-- 3. La décision par envoi : le rang (1 pour toutes les décisions écrites),
-- l'unicité par envoi, puis le signal qu'elle résout — APRÈS la recopie.
ALTER TABLE "public"."order_shortfall_decision"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "order_shortfall_decision_rank_check" CHECK ("rank" >= 1);

DROP INDEX "public"."order_shortfall_decision_order_id_key";
CREATE UNIQUE INDEX "order_shortfall_decision_order_id_rank_key"
    ON "public"."order_shortfall_decision"("order_id", "rank");

ALTER TABLE "public"."order_shortfall_decision"
    ADD CONSTRAINT "order_shortfall_decision_order_id_rank_fkey"
    FOREIGN KEY ("order_id", "rank") REFERENCES "public"."order_shortfall"("order_id", "rank")
    ON DELETE RESTRICT ON UPDATE CASCADE;
