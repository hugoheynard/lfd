-- Les allergènes descendent enfin jusqu'à la boutique.
--
-- Le PIM les saisit, les stocke et refuse de publier sans eux ; le fil catalogue
-- ne les transportait pas. La boutique qui vend le produit ignorait donc ce
-- qu'il contient — sur un champ réglementé.
--
-- `jsonb` et non `text[]` : il faut distinguer NULL (aucune fiche déclarée) de
-- `[]` (fiche déclarée, aucun allergène). Un tableau Postgres le pourrait, mais
-- une liste scalaire Prisma non — elle vaut `[]` par défaut et perd l'état.
ALTER TABLE "public"."catalog_items" ADD COLUMN "allergens" JSONB;
