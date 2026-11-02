-- ───────────────────────────────────────────────────────────────────────────
-- D'OÙ VIENT LA MARCHANDISE D'UNE COMMANDE — la marque, sans effet.
--
-- Cf. documentation/limites-de-commande/plan-jour-meme-sur-stock.md, §5, §11.1,
-- §14 (lot L1).
--
-- ADDITIVE, en un seul passage, aucune ligne réécrite :
--
-- 1. `orders.supply` (`planned` / `shelf`), NOT NULL DEFAULT `planned` : toute
--    commande existante a été fabriquée pour elle, au plan — `planned` est sa
--    valeur vraie, pas un défaut commode. Aucun chemin de passation n'écrit
--    `shelf` avant le lot L4.
-- 2. `orders.entry_shortcut` (`immediate_pickup`), nullable : le raccourci de
--    saisie qui a posé la commande ; `NULL` = aucun.
-- 3. Un CHECK miroir de l'agrégat (`Order.draft`) : une commande `shelf` est un
--    retrait daté, et un raccourci ne se pose que sur une commande `shelf`.
--    « Aujourd'hui » ne s'y écrit pas : une ligne d'hier reste valide demain.
--
-- Retour arrière : `prisma/rollback/20261102100000_d_ou_vient_la_marchandise.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TYPE "public"."OrderSupply" AS ENUM ('planned', 'shelf');

CREATE TYPE "public"."OrderEntryShortcut" AS ENUM ('immediate_pickup');

ALTER TABLE "public"."orders"
  ADD COLUMN "supply" "public"."OrderSupply" NOT NULL DEFAULT 'planned',
  ADD COLUMN "entry_shortcut" "public"."OrderEntryShortcut";

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_shelf_is_dated_pickup" CHECK (
    "supply" = 'planned'
    OR ("fulfillment_method" = 'pickup' AND "requested_delivery_date" IS NOT NULL)
  ),
  ADD CONSTRAINT "orders_entry_shortcut_on_shelf" CHECK (
    "entry_shortcut" IS NULL OR "supply" = 'shelf'
  );
