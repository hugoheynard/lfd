-- Retour arrière : `ALTER TABLE "pim"."ingredient" DROP COLUMN "declares_no_allergen"`
-- — les ingrédients déclarés « aucun allergène » redeviennent « non renseigné »
-- (aucune autre donnée perdue). Le code qui lit la colonne doit partir avant.
--
-- « AUCUN ALLERGÈNE » DÉCLARABLE SUR UN INGRÉDIENT — décision de Hugo du
-- 2026-10-26. Doc : `documentation/pim/data-model/05-allergenes-gs1-inco.md`,
-- D4 bis.
--
-- ADDITIVE : une colonne neuve, NOT NULL avec un défaut `false`. Chaque
-- ingrédient existant sans code reste donc « non renseigné » : on n'affirme
-- rien à la place de personne. L'agrégat refuse « aucun » avec des codes (les
-- codes vivent dans `ingredient_allergen`, qu'un CHECK ne peut pas lire).

ALTER TABLE "pim"."ingredient"
  ADD COLUMN "declares_no_allergen" BOOLEAN NOT NULL DEFAULT false;
