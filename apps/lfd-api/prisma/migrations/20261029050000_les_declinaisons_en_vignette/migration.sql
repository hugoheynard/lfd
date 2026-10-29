-- LES DÉCLINAISONS EN VIGNETTE — `documentation/catalogue/plan-declinaisons-en-vignette.md`.
--
-- Une option par fiche : cochée, chaque déclinaison vivante a sa vignette au
-- rayon de la boutique ; décochée, seule la déclinaison par défaut.
--
-- ADDITIF : une colonne NOT NULL à défaut constant (Postgres ne réécrit pas la
-- table). `true` pour l'existant, voulu par Hugo le 2026-10-29 : « en
-- comportement de base, on va affiner après ce déploiement ».
--
-- Retour arrière : supprimer la colonne (seul ce plan la lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product"
  ADD COLUMN "variants_as_tiles" BOOLEAN NOT NULL DEFAULT true;
