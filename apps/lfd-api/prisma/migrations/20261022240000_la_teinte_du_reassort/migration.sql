-- La teinte du RÉASSORT, réglée sur le site qui le reçoit, à côté de ses
-- couleurs de retrait et de livraison (Hugo, 2026-10-22, plan
-- documentation/comptabilite/plan-planche-des-documents-v2.md, « Décisions du
-- soir »). Elle peint les réassorts du camembert du compte à produire.
--
-- ADDITIVE : une colonne nullable, `NULL` = aucune teinte (le réassort reste
-- gris). Même forme que ses voisines : `#rrggbb` en minuscules, tenue par
-- `SiteColor` et par ce CHECK.

ALTER TABLE "public"."pickup_addresses"
  ADD COLUMN "resupply_color" TEXT;

ALTER TABLE "public"."pickup_addresses"
  ADD CONSTRAINT "pickup_addresses_resupply_color_check"
    CHECK ("resupply_color" ~ '^#[0-9a-f]{6}$');
