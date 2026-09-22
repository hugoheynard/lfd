-- Lot 4 de `documentation/pim/plan-separer-allergenes-et-nutrition.md` (§6d).
--
-- L'alignement sur la déclinaison par défaut se dédouble : un drapeau pour les
-- allergènes, un pour la nutrition. C'est la décision D1 — les deux moitiés de
-- la fiche s'écrivent séparément depuis le lot 3, et un drapeau unique aurait
-- fait suivre le défaut sur une moitié qu'on venait de saisir à la main.
--
-- 🔴 UNE seule colonne neuve. `regulatory_follows_default` devient le drapeau
-- des ALLERGÈNES sans changer de nom : elle n'est ni vidée, ni déplacée, ni
-- resserrée — elle garde sa valeur et ses lecteurs, et n'en perd qu'une moitié
-- de sens. Le « étendre, basculer, resserrer » du CLAUDE.md §0 protège un
-- déplacement de données ; il n'y en a pas ici. Ajouter en prime
-- `allergens_follows_default` aurait fait vivre trois colonnes pour deux
-- drapeaux, avec une fenêtre où deux d'entre elles se prétendent autoritaires
-- sur le même fait.
--
-- ⚠️ Ce qui se paie : le nom de la colonne ment un peu sur son sujet. Il dit
-- vrai sur ce qu'il protège — le `CHECK` et les lecteurs existants — et il
-- dira faux sur ce qu'il décrit jusqu'au lot 7, qui peut le renommer d'une
-- migration additive si quelqu'un la juge rentable.
--
-- ⚠️ Écrite À LA MAIN plutôt que par `prisma migrate dev`, pour la raison
-- écrite dans `20260922180000_separation_allergenes_nutrition` : celui-ci exige
-- une remise à blanc de la base de développement, et son `diff` propose en
-- prime de SUPPRIMER quatre index uniques posés en SQL à la main.
ALTER TABLE "pim"."product_variant"
  ADD COLUMN "nutrition_follows_default" BOOLEAN NOT NULL DEFAULT false;

-- Le drapeau naît à la valeur de celui qu'il dédouble : une déclinaison
-- alignée l'était sur la fiche ENTIÈRE. Partir à `false` la désalignerait
-- silencieusement côté nutrition, ce que personne n'a décidé.
UPDATE "pim"."product_variant"
  SET "nutrition_follows_default" = "regulatory_follows_default";

-- Même raison que les deux autres : le défaut ne peut pas se suivre lui-même.
ALTER TABLE "pim"."product_variant"
  ADD CONSTRAINT "product_variant_default_feeds_itself"
  CHECK (NOT ("is_default" AND "nutrition_follows_default"));
