-- LA QUANTITÉ MINIMALE SAISIE — lot M1 de `documentation/catalogue/plan-quantite-minimale.md`.
--
-- Par déclinaison, un minimum par AUDIENCE seulement (Q2, Hugo, 2026-10-29 :
-- le catalogue ne sait pas distinguer à emporter et sur place) : une colonne
-- pro, une colonne public, en PIÈCES (entier >= 2 — 1 ne dit rien). `NULL` est
-- la donnée : pas de minimum. Et le drapeau « suit le minimum du défaut »,
-- même idiome que `pricing_follows_default`.
--
-- ADDITIF : trois colonnes, deux nullables et une à défaut `false` (aucune
-- déclinaison existante ne suit rien qu'elle n'ait demandé).
--
-- Retour arrière : supprimer les trois colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "pro_min_quantity" INTEGER,
  ADD COLUMN "public_min_quantity" INTEGER,
  ADD COLUMN "min_quantity_follows_default" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "product_variant_pro_min_quantity_check"
    CHECK ("pro_min_quantity" >= 2),
  ADD CONSTRAINT "product_variant_public_min_quantity_check"
    CHECK ("public_min_quantity" >= 2),
  ADD CONSTRAINT "product_variant_default_min_quantity_follows_itself_check"
    CHECK (NOT ("is_default" AND "min_quantity_follows_default"));
