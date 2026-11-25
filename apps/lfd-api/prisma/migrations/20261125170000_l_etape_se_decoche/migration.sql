-- Une étape se décoche (plan `documentation/fournil/plan-produit-sur-plusieurs-postes.md`,
-- § 2.11, point 2) : la ligne reste, son statut passe à `undone` et sa
-- version monte. La supprimer perdrait la version et l'auteur du dernier geste.
--
-- Le CHECK s'élargit : aucune ligne existante ne le viole.
ALTER TABLE "production"."production_line_step"
    DROP CONSTRAINT "production_line_step_status";
ALTER TABLE "production"."production_line_step"
    ADD CONSTRAINT "production_line_step_status" CHECK ("status" IN ('done', 'red', 'undone'));
