-- L'AUDIENCE PAR DÉCLINAISON — lot AD1 de
-- `documentation/catalogue/plan-audience-par-declinaison.md` (A1).
--
-- Une déclinaison peut déroger à l'audience de sa fiche, comme la fiche
-- déroge à celle de sa famille : le cookie se vend au public, sa déclinaison
-- « formule » se commande seulement en réassort (`resupply`).
--
-- ADDITIF : une colonne nullable et son CHECK. Aucune ligne n'est écrite :
-- toute déclinaison existante vaut `NULL`, c'est-à-dire qu'elle suit sa
-- fiche — exactement ce qu'elle vend aujourd'hui.
--
-- Retour arrière : remettre chaque déclinaison sur l'audience de sa fiche
-- (`NULL`) AVANT de revenir au code d'avant, qui ignorerait la colonne et
-- écrirait l'audience de la fiche sur chaque article (A6). La colonne reste.

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "audience" TEXT,
  ADD CONSTRAINT "product_variant_audience_check"
    CHECK ("audience" IN ('pro', 'public', 'both', 'resupply'));
