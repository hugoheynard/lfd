-- Le colisage simple (documentation/colisage/plan-niveaux-de-suivi-colisage.md,
-- § 4, lot C1). Additive : des colonnes neuves avec un défaut sûr, une table
-- neuve. Rien n'est supprimé, renommé ni resserré.
--
-- - `packing_settings.pickup_tracking_level` : le niveau du colisage d'un
--   retrait, `simple` par défaut (D2) ;
-- - `packing_order.tracking_level` : le niveau figé à la naissance de la
--   fiche (D3). `NULL` — fiche d'avant la colonne, livraison — se lit
--   détaillé : toute fiche existante reste détaillée ;
-- - `packing_order.handed_over_at` : la commande retirée par le client (D5) ;
-- - `packing_stock.missing` : les pièces dites absentes, mises de côté (D6) ;
-- - `packing_applied_correction` : par remise, ce que les corrections du
--   fournil ont réellement baissé (D9).
--
-- Les trois dernières ne sont lues par aucun comportement avant les lots
-- C2 et C4.

SET lock_timeout = '5s';

ALTER TABLE "packing"."packing_settings"
  ADD COLUMN "pickup_tracking_level" TEXT NOT NULL DEFAULT 'simple';

ALTER TABLE "packing"."packing_settings"
  ADD CONSTRAINT "packing_settings_pickup_tracking_level_check"
  CHECK ("pickup_tracking_level" IN ('simple', 'detailed'));

ALTER TABLE "packing"."packing_order"
  ADD COLUMN "tracking_level" TEXT NULL,
  ADD COLUMN "handed_over_at" TIMESTAMPTZ(6) NULL;

ALTER TABLE "packing"."packing_order"
  ADD CONSTRAINT "packing_order_tracking_level_check"
  CHECK ("tracking_level" IN ('simple', 'detailed'));

ALTER TABLE "packing"."packing_stock"
  ADD COLUMN "missing" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "packing"."packing_stock"
  ADD CONSTRAINT "packing_stock_missing_check" CHECK ("missing" >= 0);

CREATE TABLE "packing"."packing_applied_correction" (
  "service_day" VARCHAR(10) NOT NULL,
  "handoff_id"  TEXT        NOT NULL,
  "sku"         TEXT        NOT NULL,
  "applied"     INTEGER     NOT NULL,
  CONSTRAINT "packing_applied_correction_pkey" PRIMARY KEY ("service_day", "handoff_id", "sku"),
  CONSTRAINT "packing_applied_correction_applied_check" CHECK ("applied" >= 0)
);
