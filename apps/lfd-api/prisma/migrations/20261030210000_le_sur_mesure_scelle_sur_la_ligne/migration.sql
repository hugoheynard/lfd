-- LE SUR MESURE SCELLÉ SUR LA LIGNE — `documentation/catalogue/plan-sur-mesure-partout.md`,
-- lots M1 et M2.
--
-- Le marqueur « sur mesure » du catalogue se fige sur la ligne de commande à
-- la passation, puis voyage jusqu'au fournil, recopié à l'arrêt de la
-- journée. Il n'est jamais relu au catalogue par l'aval.
--
-- ADDITIF : deux colonnes nullables, sans défaut. `NULL` = ligne écrite avant
-- ce lot — on ne savait pas. AUCUNE reprise : remplir le passé depuis le
-- marqueur d'aujourd'hui serait inventer (il a pu changer depuis).
--
-- Retour arrière : supprimer les deux colonnes.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_lines"
  ADD COLUMN "made_to_order" BOOLEAN;

ALTER TABLE "production"."production_order_line"
  ADD COLUMN "made_to_order" BOOLEAN;
