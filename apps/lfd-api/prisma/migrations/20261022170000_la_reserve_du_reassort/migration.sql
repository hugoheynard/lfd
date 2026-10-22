-- LE RÉASSORT « AU PLUS TÔT » AU COLISAGE, ET SA RÉSERVE (lot R4b de
-- documentation/reassort-boutiques/plan-au-plus-tot.md, §2 ③ et §3 — Hugo
-- 2026-10-22, Q7 : « le colisage réserve les pièces d'un réassort lancé »).
--
-- 1. `packing.packing_resupply.kind` : la fiche d'un réassort figé à l'arrêt
--    (`evening`) ou d'un réassort « au plus tôt » lancé dans la journée
--    (`asap`). Toutes les fiches existantes viennent d'un arrêt : elles
--    prennent le défaut.
-- 2. `packing.packing_stock_reservation` : la part de la réserve du jour
--    (`packing_stock`) qu'un réassort lancé retient pour lui. Une commande ne
--    prend pas une pièce réservée ; la réserve se lève (`released_at`) quand
--    la fiche est close. Clé étrangère vers la LIGNE de la fiche, dans le même
--    schéma : on ne réserve que ce qu'une fiche demande. Aucune colonne ne
--    nomme une personne (rien au registre RGPD).
--
-- ADDITIVE : une colonne NOT NULL avec défaut, une table neuve et ses
-- déclencheurs `day_change` (la forme de `20261022140000`). Rien de retiré,
-- rien de renommé, aucune donnée convertie. Aucun droit accordé.
--
-- Retour arrière du SCHÉMA : `DROP TABLE "packing"."packing_stock_reservation"`
-- (ses déclencheurs partent avec), puis `DROP CONSTRAINT
-- "packing_resupply_kind_known"` et `DROP COLUMN "kind"`, une fois qu'aucun
-- binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "packing"."packing_resupply"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'evening',
  ADD CONSTRAINT "packing_resupply_kind_known" CHECK ("kind" IN ('evening', 'asap'));

CREATE TABLE "packing"."packing_stock_reservation" (
    "service_day" VARCHAR(10) NOT NULL,
    "sku" TEXT NOT NULL,
    "resupply_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reserved_at" TIMESTAMPTZ(6) NOT NULL,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "packing_stock_reservation_pkey" PRIMARY KEY ("service_day","resupply_id","sku"),
    CONSTRAINT "packing_stock_reservation_quantity_positive" CHECK ("quantity" > 0)
);

-- Lue sous le verrou de `packing_stock` (jour, SKU) : à chaque mise au bac.
CREATE INDEX "packing_stock_reservation_service_day_sku_idx"
  ON "packing"."packing_stock_reservation"("service_day", "sku");

ALTER TABLE "packing"."packing_stock_reservation"
  ADD CONSTRAINT "packing_stock_reservation_line_fkey"
  FOREIGN KEY ("service_day", "resupply_id", "sku")
  REFERENCES "packing"."packing_resupply_line"("service_day", "resupply_id", "sku")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "packing_stock_reservation_day_change_insert"
  AFTER INSERT ON "packing"."packing_stock_reservation"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_stock_reservation_day_change_update"
  AFTER UPDATE ON "packing"."packing_stock_reservation"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_stock_reservation_day_change_delete"
  AFTER DELETE ON "packing"."packing_stock_reservation"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
