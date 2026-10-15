-- LE PRIX PRO SAISI — lot P (P1) de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md`.
--
-- Un prix professionnel HORS TAXE par déclinaison, en millicentimes (10⁻⁵ €,
-- l'unité que le fil et `catalog_items.price_millicents` portent déjà).
--
-- ADDITIF : une colonne nullable, aucune ligne réécrite. La méthode des règles
-- comptables reste `ratio_ttc` : rien ne lit cette colonne pour tarifer tant
-- que Hugo n'a pas pré-rempli (P5) puis basculé la méthode sur `entered`.
--
-- Retour arrière : supprimer la colonne (seul le lot P la lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "pro_price_millicents" INTEGER,
  ADD CONSTRAINT "product_variant_pro_price_millicents_check" CHECK ("pro_price_millicents" >= 0);
