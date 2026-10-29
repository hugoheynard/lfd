-- LES DÉCLINAISONS EN VIGNETTE AU COMMERCE — `documentation/catalogue/plan-declinaisons-en-vignette.md`.
--
-- Le miroir du catalogue reçoit, sur chaque article, deux faits de sa fiche
-- (fil v16) : l'option « chaque déclinaison en vignette », et le nom de la
-- fiche, qui précède celui de la déclinaison sur sa vignette.
--
-- ADDITIF : une colonne NOT NULL à défaut constant (`true`, la valeur de toute
-- fiche existante au référentiel) et une colonne nullable (`NULL` = article
-- reçu avant ce lot, que la prochaine émission de la fiche remplit).
--
-- Retour arrière : supprimer les deux colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "variants_as_tiles" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "product_name" TEXT;
