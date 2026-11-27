-- CHAQUE ENVOI DU DOSSIER NOTE SA VERSION
-- (documentation/fournil/plan-historique-des-tirages.md, § 7 Q2, lot H2b).
--
-- La trace d'envoi du dossier du jour dit à qui il est parti et quand ; elle
-- ne disait pas QUEL plan. Le réenvoi en a besoin : pour chaque destinataire,
-- la dernière version reçue, et ce qui a changé depuis. Le numéro est celui
-- de la journée que l'abonné a chargée, donc celui du papier joint. Colonne
-- nullable, additive : les envois déjà tracés restent NULL (on ne sait pas),
-- et le binaire d'avant l'ignore.
--
-- Retour arrière : `prisma/rollback/20261128001000_chaque_envoi_du_dossier_note_sa_version.sql`.
SET lock_timeout = '5s';

ALTER TABLE "production"."production_dossier_dispatch"
  ADD COLUMN "plan_version" INTEGER;
