-- LE LIBELLÉ INTERNE D'UNE DÉCLINAISON — `documentation/catalogue/plan-identite-de-declinaison.md`, I3.
--
-- ADDITIF : une colonne nullable, sans défaut (Postgres ne réécrit pas la
-- table). `name` reste le nom de BOUTIQUE, celui que citent le fil, les
-- commandes et les factures passées. `NULL` = le libellé est le français de
-- `name` ; aucune ligne existante n'est réécrite : une déclinaison dont on n'a
-- jamais changé le nom de boutique a, par construction, un libellé égal à son
-- nom. Le libellé se fige au premier écart, par l'agrégat.
--
-- Retour arrière : supprimer la colonne (seul ce plan la lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "internal_label" TEXT;
