-- LA COMMANDE FIGÉE SAIT SI ELLE EST HORS PLAN
-- (documentation/fournil/plan-historique-des-tirages.md, § 1.8, lot H0).
--
-- Le commerce sait qu'une commande a été reçue hors plan (`placed_off_plan`,
-- posé par le staff après l'arrêt) ; le fournil, lui, ne le gardait pas. Les
-- versions du plan en ont besoin pour dire « hors plan, intégrée au
-- retirage ». Colonne nullable, additive : les lignes déjà en base restent
-- NULL — on ne savait pas, on n'invente pas `false` — et le binaire d'avant
-- l'ignore.
--
-- Retour arrière : `prisma/rollback/20261128000000_la_commande_figee_sait_si_elle_est_hors_plan.sql`.
SET lock_timeout = '5s';

ALTER TABLE "production"."production_order"
  ADD COLUMN "off_plan" BOOLEAN;
