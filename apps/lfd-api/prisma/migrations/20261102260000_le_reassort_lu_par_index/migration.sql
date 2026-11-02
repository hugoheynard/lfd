-- LE RÉASSORT LU PAR INDEX — deux lectures de toute une journée, ou de tous
-- les points, qui balayaient leur table (audit du réassort, 2026-11-02,
-- points C4 et M-B de `documentation/reassort-boutiques/reste-a-faire.md`).
--
-- ADDITIVE : deux index neufs, aucune colonne ni contrainte touchée.
--
-- 1. `resupply_receipt (service_day)` — l'onglet Stock lit les reçus d'UNE
--    journée pour TOUS les points (`PrismaDayStockReader.receiptsOn`) :
--    l'index `(site_id, service_day)` commence par le point et ne sert pas.
--    Filtrer par point n'est pas possible ici, la vue est tous points.
-- 2. `site_stock_alert (declared_at DESC, id DESC) WHERE lifted_at IS NULL`
--    — les alertes vivantes de tous les points, les plus récentes d'abord
--    (`PrismaStockAlertReader.liveEverywhere`). Une alerte levée reste en
--    table pour toujours : sans index partiel, la lecture balaierait tout
--    l'historique pour en rendre quelques-unes. Partiel, donc écrit ici
--    seulement — Prisma ne sait pas le déclarer (même cas que
--    `site_stock_alert_live_site_sku_key`).
--
-- Tables petites aujourd'hui : un `CREATE INDEX` simple, sous `lock_timeout`,
-- plutôt que `CONCURRENTLY`, qui ne tourne pas dans la transaction de Prisma.
--
-- Retour arrière : `prisma/rollback/20261102260000_le_reassort_lu_par_index.sql`.

SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "resupply_receipt_service_day_idx"
  ON "public"."resupply_receipt" ("service_day");

CREATE INDEX IF NOT EXISTS "site_stock_alert_live_declared_idx"
  ON "public"."site_stock_alert" ("declared_at" DESC, "id" DESC)
  WHERE "lifted_at" IS NULL;
