-- RETOUR ARRIÈRE de 20261128002000_le_renvoi_du_dossier_est_une_demande
-- (documentation/fournil/les-versions-du-plan.md).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- Refusé tant qu'une trace `requested` existe : la resserrer d'abord la
-- ferait mentir (un renvoi demandé n'est ni parti ni échoué). La relever, et
-- décider de chacune, avant de rejouer ceci.

ALTER TABLE "production"."production_dossier_dispatch"
  DROP CONSTRAINT "production_dossier_dispatch_outcome_check";

ALTER TABLE "production"."production_dossier_dispatch"
  ADD CONSTRAINT "production_dossier_dispatch_outcome_check"
  CHECK ("outcome" IN ('pending', 'sent', 'failed'));
