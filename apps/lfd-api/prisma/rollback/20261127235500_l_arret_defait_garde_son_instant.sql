-- RETOUR ARRIÈRE de 20261127235500_l_arret_defait_garde_son_instant
-- (documentation/fournil/les-versions-du-plan.md).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- La colonne est additive : le code d'avant l'ignore. Sans elle, un arrêt
-- après réouverture ne sait plus attendre la remise du commerce.

ALTER TABLE "production"."production_day" DROP COLUMN "undone_closed_at";
