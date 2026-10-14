-- LA COMMANDE REÇUE HORS PLAN
--
-- Plan `documentation/commandes/plan-reglages-commandes.md`, §8.3, lot O3
-- (Hugo, 2026-10-14) : l'équipe peut encore saisir une commande pour une
-- journée dont le plan est arrêté ; elle est reçue, et marquée. Le retirage
-- du fournil la fait entrer au plan, comme avant.
--
-- ADDITIF : une colonne NOT NULL avec défaut `false` (pas de réécriture de
-- table sous Postgres ≥ 11). Les commandes existantes restent à `false`.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN "placed_off_plan"` une fois
-- qu'aucun binaire ne la lit.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders" ADD COLUMN "placed_off_plan" BOOLEAN NOT NULL DEFAULT false;
