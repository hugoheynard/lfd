-- LE RANG AU FOURNIL ET AU COLISAGE — plan E7, lot L3b
-- (`documentation/commandes/plan-e7-reliquat-bati.md`, choix 5 et 14) :
-- l'identité aval d'une commande devient l'ENVOI `(commande, rang)`. Un
-- reliquat du même jour aura sa ligne de plan et sa feuille de colisage, sur
-- le même stock ; le rang 1 est la commande elle-même, défaut de toutes les
-- lignes écrites.
--
-- Aucune donnée supprimée ni réécrite : chaque ligne existante prend rank = 1,
-- les nouvelles clés contiennent les anciennes, donc elles tiennent dès leur
-- pose. Un seul fichier, une transaction (Prisma).
--
-- RETOUR ARRIÈRE, sans perte tant qu'aucune ligne de rang > 1 n'a été écrite
-- (sinon les anciennes clés refuseraient de se reposer — c'est voulu) :
--   ALTER TABLE "packing"."packing_line" DROP CONSTRAINT "packing_line_service_day_order_id_rank_fkey";
--   ALTER TABLE "packing"."container" DROP CONSTRAINT "container_service_day_order_id_rank_fkey";
--   ALTER TABLE "packing"."packing_line" DROP CONSTRAINT "packing_line_pkey";
--   ALTER TABLE "packing"."packing_order" DROP CONSTRAINT "packing_order_pkey";
--   ALTER TABLE "packing"."packing_order" ADD CONSTRAINT "packing_order_pkey" PRIMARY KEY ("service_day", "order_id");
--   ALTER TABLE "packing"."packing_line" ADD CONSTRAINT "packing_line_pkey" PRIMARY KEY ("service_day", "order_id", "sku");
--   ALTER TABLE "packing"."packing_line" ADD CONSTRAINT "packing_line_service_day_order_id_fkey"
--       FOREIGN KEY ("service_day", "order_id") REFERENCES "packing"."packing_order"("service_day", "order_id")
--       ON DELETE RESTRICT ON UPDATE CASCADE;
--   ALTER TABLE "packing"."container" ADD CONSTRAINT "container_service_day_order_id_fkey"
--       FOREIGN KEY ("service_day", "order_id") REFERENCES "packing"."packing_order"("service_day", "order_id")
--       ON DELETE RESTRICT ON UPDATE CASCADE;
--   ALTER TABLE "packing"."container" DROP COLUMN "rank";
--   ALTER TABLE "packing"."packing_line" DROP COLUMN "rank";
--   ALTER TABLE "packing"."packing_order" DROP COLUMN "rank";
--   DROP INDEX "production"."production_order_service_day_order_id_rank_key";
--   CREATE UNIQUE INDEX "production_order_service_day_order_id_key"
--       ON "production"."production_order" ("service_day", "order_id");
--   ALTER TABLE "production"."production_order" DROP COLUMN "rank";

-- 1. Le fournil : une ligne de plan par envoi et par journée.
ALTER TABLE "production"."production_order"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "production_order_rank_check" CHECK ("rank" >= 1);

DROP INDEX "production"."production_order_service_day_order_id_key";
CREATE UNIQUE INDEX "production_order_service_day_order_id_rank_key"
    ON "production"."production_order" ("service_day", "order_id", "rank");

-- 2. Le colisage : la colonne d'abord, sur les trois tables.
ALTER TABLE "packing"."packing_order"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT "packing_order_rank_check" CHECK ("rank" >= 1);
ALTER TABLE "packing"."packing_line"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "packing"."container"
    ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;

-- 3. Les deux clés étrangères composites tombent AVANT la clé qu'elles visent.
ALTER TABLE "packing"."packing_line" DROP CONSTRAINT "packing_line_service_day_order_id_fkey";
ALTER TABLE "packing"."container" DROP CONSTRAINT "container_service_day_order_id_fkey";

-- 4. Les clés primaires, recréées avec le rang.
ALTER TABLE "packing"."packing_order" DROP CONSTRAINT "packing_order_pkey";
ALTER TABLE "packing"."packing_order"
    ADD CONSTRAINT "packing_order_pkey" PRIMARY KEY ("service_day", "order_id", "rank");

ALTER TABLE "packing"."packing_line" DROP CONSTRAINT "packing_line_pkey";
ALTER TABLE "packing"."packing_line"
    ADD CONSTRAINT "packing_line_pkey" PRIMARY KEY ("service_day", "order_id", "rank", "sku");

-- 5. Les deux clés étrangères, recréées sur les trois colonnes. Une ligne ou
-- un contenant de rang 1 vise la feuille de rang 1 : rien ne se détache.
ALTER TABLE "packing"."packing_line"
    ADD CONSTRAINT "packing_line_service_day_order_id_rank_fkey"
    FOREIGN KEY ("service_day", "order_id", "rank")
    REFERENCES "packing"."packing_order"("service_day", "order_id", "rank")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "packing"."container"
    ADD CONSTRAINT "container_service_day_order_id_rank_fkey"
    FOREIGN KEY ("service_day", "order_id", "rank")
    REFERENCES "packing"."packing_order"("service_day", "order_id", "rank")
    ON DELETE RESTRICT ON UPDATE CASCADE;
