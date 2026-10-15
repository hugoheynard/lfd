-- LA VALIDATION AVANT LA BOUTIQUE PUBLIQUE — lot 3 de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md`
-- (« Lot 3 — décisions déjà prises »).
--
-- `catalog_items.public_review_pending` : « personne n'a encore regardé cet
-- article pour la boutique publique ». Posé à `true` par le SEUL récepteur des
-- faits d'une fiche, à la CRÉATION d'une ligne (premier SKU arrivé), jamais
-- ensuite ; levé par le geste du back-office (`POST admin/catalog/public-review/approve`).
-- Distinct du masquage (`catalog_item_overrides`), que le récepteur n'écrit
-- toujours pas (§4 bis).
--
-- ADDITIF, et rien de servi ne change : toute ligne existante naît `false`,
-- donc rien de ce qui est en ligne ne repasse en attente — « tout renvoyer »
-- à la bascule ne pose le drapeau que sur les SKU encore inconnus. Le push ne
-- l'écrit jamais à `true`.
--
-- Retour arrière : supprimer la colonne (lue par `servedTo` et la vue
-- « Catalogue publié » seulement).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "public_review_pending" BOOLEAN NOT NULL DEFAULT false;
