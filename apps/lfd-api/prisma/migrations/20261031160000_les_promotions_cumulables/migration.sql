-- Les promotions cumulables — plan
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md,
-- § 16 et § 16.1 (lot L12).
--
-- ADDITIVE : une colonne neuve, `false` pour toutes les promotions existantes
-- — non cumulatives par défaut, ce qu'elles étaient. Aucun prix servi ne
-- change : sans promotion cumulable, l'étage `promotion` suit le chemin
-- d'avant (§ 16.1, « égalité au centime : intacte »).
--
-- Point ligne seulement pour l'instant : une commande ne porte encore qu'UNE
-- remise de panier (§ 16.1), le CHECK le tient comme l'agrégat
-- (`PromotionLineOnlyOptionError`).
--
-- Réversible : la colonne ne sert qu'aux promotions qui la cochent ;
-- `UPDATE public.promotions SET cumulative = false` rend l'état d'avant.

SET lock_timeout = '5s';

ALTER TABLE "public"."promotions"
  ADD COLUMN "cumulative" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."promotions"
  ADD CONSTRAINT "promotions_cumulative_line_only"
    CHECK (NOT "cumulative" OR "application_point" = 'line');
