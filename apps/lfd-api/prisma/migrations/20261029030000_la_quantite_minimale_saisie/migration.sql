-- LA QUANTITÉ MINIMALE SAISIE — lot M1 de `documentation/catalogue/plan-quantite-minimale.md`.
--
-- Par déclinaison, une matrice audience (`pro` | `public`) × contexte de vente :
-- une ligne par case réglée, en PIÈCES (entier >= 2 — 1 ne dit rien). L'absence
-- de ligne est la donnée : pas de minimum. Et sur la déclinaison, le drapeau
-- « suit le minimum du défaut », même idiome que `pricing_follows_default`.
--
-- ADDITIF : une table neuve, une colonne à défaut `false` (aucune déclinaison
-- existante ne suit rien qu'elle n'ait demandé). Le contexte est en `RESTRICT` :
-- un contexte qui porte un minimum ne se supprime pas sous lui. La déclinaison
-- en `CASCADE`, comme les satellites de la fiche (elle ne se supprime pas).
--
-- Retour arrière : supprimer la table et la colonne (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "min_quantity_follows_default" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "product_variant_default_min_quantity_follows_itself_check"
    CHECK (NOT ("is_default" AND "min_quantity_follows_default"));

CREATE TABLE "pim"."variant_min_quantity" (
  "variant_id" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "context_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "variant_min_quantity_pkey" PRIMARY KEY ("variant_id", "audience", "context_id"),
  CONSTRAINT "variant_min_quantity_audience_check" CHECK ("audience" IN ('pro', 'public')),
  CONSTRAINT "variant_min_quantity_quantity_check" CHECK ("quantity" >= 2)
);

CREATE INDEX "variant_min_quantity_context_id_idx" ON "pim"."variant_min_quantity"("context_id");

ALTER TABLE "pim"."variant_min_quantity"
  ADD CONSTRAINT "variant_min_quantity_variant_id_fkey" FOREIGN KEY ("variant_id")
    REFERENCES "pim"."product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "variant_min_quantity_context_id_fkey" FOREIGN KEY ("context_id")
    REFERENCES "pim"."sales_context"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
