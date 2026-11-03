-- RETOUR ARRIÈRE de 20261103100000_la_tolerance_de_retard
-- (la tolérance de retard, Hugo 2026-11-03).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE, APRÈS le retour du code qui ne lit plus la colonne. La
-- migration reste inscrite « appliquée ». Seule la tolérance réglée est
-- perdue ; le créneau dépassé resonne alors à la première minute.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_cutoff_settings"
    DROP CONSTRAINT IF EXISTS "order_cutoff_settings_late_tolerance_check";
ALTER TABLE "public"."order_cutoff_settings"
    DROP COLUMN IF EXISTS "late_tolerance_minutes";
