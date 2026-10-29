-- LA FILIATION DU DÉTACHEMENT AU COMMERCE — `documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L7.
--
-- Le miroir du catalogue reçoit, sur chaque article d'une fiche née d'un
-- détachement, l'ancienne référence de vente : le SKU de la déclinaison
-- d'origine. Le commerce s'en sert pour lister les décisions tarifaires
-- restées sur cette référence ; il ne les déplace jamais tout seul.
--
-- ADDITIF : une colonne nullable, sans défaut (`NULL` = article qui n'est pas
-- né d'un détachement, ou reçu avant ce lot — la prochaine émission de sa
-- fiche la remplit). Aucune donnée réécrite.
--
-- Retour arrière : supprimer la colonne (seul ce lot la lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "detached_from_sku" TEXT;
