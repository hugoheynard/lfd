-- LE NOM D'UN RÉASSORT (lot R1g de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md — Hugo
-- 2026-10-21 : « on devrait pouvoir donner un nom à une demande de réassort,
-- exemple : vitrine du matin »).
--
-- 1. `site_resupply.name` : le nom LIBRE et facultatif que le comptoir pose
--    sur sa demande en cours, ou le fournil à l'envoi. Rogné par le domaine,
--    vide → NULL ; la CHECK tient la même borne (1 à 60 caractères, sans
--    blanc en bord) pour qu'aucun écrivain ne la contourne.
-- 2. `production_resupply.name` : sa copie FIGÉE à l'arrêt du plan, comme
--    `site_label`. NULL pour un réassort figé avant la colonne.
-- 3. `packing_resupply.name` : la copie du colisage, tirée du fait du fournil.
--    NULL pour une fiche tirée avant la colonne.
--
-- ADDITIVE : trois colonnes nullables, aucune valeur réécrite, rien de
-- retiré ni de renommé. Aucun droit accordé.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN "name"` sur les trois tables une
-- fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "public"."site_resupply"
  ADD COLUMN "name" VARCHAR(60),
  ADD CONSTRAINT "site_resupply_name_trimmed" CHECK (
    "name" IS NULL OR (char_length("name") BETWEEN 1 AND 60 AND "name" = btrim("name"))
  );

ALTER TABLE "production"."production_resupply" ADD COLUMN "name" TEXT;

ALTER TABLE "packing"."packing_resupply" ADD COLUMN "name" TEXT;
