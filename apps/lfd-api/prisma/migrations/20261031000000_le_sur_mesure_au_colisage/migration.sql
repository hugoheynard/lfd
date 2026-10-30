-- LE SUR MESURE AU COLISAGE — `documentation/catalogue/plan-sur-mesure-partout.md`,
-- lot M4 (§ 5 bis ; décision de Hugo du 2026-10-30).
--
-- 1. `packing_line.made_to_order` : le marqueur que le fait
--    `production.packing_list_drawn` porte par ligne, recopié à l'inscription.
--    `NULL` = ligne inscrite avant ce lot, ou fait publié sans le champ — on ne
--    savait pas. AUCUNE reprise : le colisage ne lit pas le commerce.
-- 2. `packing_settings.show_made_to_order` : le réglage « Afficher le sur
--    mesure à l'écran du colisage », vrai par défaut. Aucun droit accordé.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie : supprimer les deux
-- colonnes.

SET lock_timeout = '5s';

ALTER TABLE "packing"."packing_line"
  ADD COLUMN "made_to_order" BOOLEAN;

ALTER TABLE "packing"."packing_settings"
  ADD COLUMN "show_made_to_order" BOOLEAN NOT NULL DEFAULT true;
