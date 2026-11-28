-- RETOUR ARRIÈRE de 20261128000500_les_versions_du_plan
-- (documentation/fournil/les-versions-du-plan.md).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- La table et la colonne sont additives : le code d'avant les ignore. Les
-- jouer efface toutes les versions gardées — la trace des changements du
-- plan après l'arrêt — sans retour possible.

DROP TABLE "production"."plan_versions";
ALTER TABLE "production"."production_day" DROP COLUMN "plan_version";
