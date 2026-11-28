-- RETOUR ARRIÈRE de 20261128001000_chaque_envoi_du_dossier_note_sa_version
-- (documentation/fournil/les-versions-du-plan.md).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- La colonne est additive : le code d'avant l'ignore. Sans elle, le réenvoi
-- ne sait plus quelle version chaque destinataire a reçue.

ALTER TABLE "production"."production_dossier_dispatch" DROP COLUMN "plan_version";
