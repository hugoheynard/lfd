-- RETOUR ARRIÈRE de 20261103110000_le_retrait_dans_son_schema.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- 🔴 LE CODE D'ABORD, LE SQL ENSUITE : ne jouer ceci qu'une fois en ligne une
-- image qui vise `production.<table>`. Joué sous une image qui vise
-- `handover.*`, il rend au comptoir le 500 que la migration évite.
-- Aucune donnée n'est perdue : `SET SCHEMA` déplace, il ne recopie pas.

SET lock_timeout = '5s';

DROP VIEW IF EXISTS "production"."order_handover";
DROP VIEW IF EXISTS "production"."order_handover_proof";
DROP VIEW IF EXISTS "production"."order_departure";

ALTER TABLE "handover"."order_handover" SET SCHEMA "production";
ALTER TABLE "handover"."order_handover_proof" SET SCHEMA "production";
ALTER TABLE "handover"."order_departure" SET SCHEMA "production";

DROP SCHEMA IF EXISTS "handover";
