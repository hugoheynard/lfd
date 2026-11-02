-- RETOUR ARRIÈRE de 20261102260000_le_reassort_lu_par_index
-- (audit du réassort, 2026-11-02).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Retire les deux index : aucune donnée n'est perdue, les lectures
-- retrouvent leur balayage d'avant.

SET lock_timeout = '5s';

DROP INDEX IF EXISTS "public"."site_stock_alert_live_declared_idx";
DROP INDEX IF EXISTS "public"."resupply_receipt_service_day_idx";
