-- L'alignement sur la déclinaison par défaut devient **une décision par
-- section**, et non plus la seule fiche réglementaire.
--
-- Deux colonnes plutôt qu'un tableau de sections : chacune porte son propre
-- `CHECK`, et une colonne typée refuse à l'écriture ce qu'un `text[]` ne
-- refuserait qu'à la lecture. Le jour où une troisième section devient
-- alignable, elle prend sa colonne — une migration additive de plus, pas une
-- valeur de plus dans un sac.
--
-- ⚠️ Le tarif ne s'aligne PAS par défaut, et surtout pas pour les déclinaisons
-- déjà créées : une seconde déclinaison existe le plus souvent parce qu'elle se
-- vend à un autre prix, et basculer l'existant vers l'héritage ferait facturer
-- le prix du défaut sur des articles qui portaient le leur.
ALTER TABLE "pim"."product_variant"
  ADD COLUMN "pricing_follows_default" BOOLEAN NOT NULL DEFAULT false;

-- Même raison que pour le réglementaire : le défaut ne peut pas se suivre
-- lui-même, sinon son prix n'est jamais posé et jamais refusé.
ALTER TABLE "pim"."product_variant"
  ADD CONSTRAINT "product_variant_default_prices_itself"
  CHECK (NOT ("is_default" AND "pricing_follows_default"));
