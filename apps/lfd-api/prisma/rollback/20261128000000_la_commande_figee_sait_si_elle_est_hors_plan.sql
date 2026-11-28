-- RETOUR ARRIÈRE de 20261128000000_la_commande_figee_sait_si_elle_est_hors_plan
-- (documentation/fournil/les-versions-du-plan.md).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- La colonne est additive : le code d'avant l'ignore. Sans elle, les versions
-- du plan ne savent plus dire qu'une commande a été reçue hors plan.

ALTER TABLE "production"."production_order" DROP COLUMN "off_plan";
