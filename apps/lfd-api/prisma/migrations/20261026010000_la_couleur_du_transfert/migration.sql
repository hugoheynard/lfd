-- La couleur du TRANSFERT vers un site, réglée sur le site servi par
-- transfert, à côté de ses couleurs de retrait (Hugo, 2026-10-25). Elle peint
-- la bordure de l'encadré qui regroupe ses retraits au colisage.
--
-- ADDITIVE : une colonne nullable, `NULL` = la couleur de livraison du site
-- de départ. Même forme que ses voisines : `#rrggbb` en minuscules, tenue par
-- `SiteColor` et par ce CHECK. Aucun droit accordé.

ALTER TABLE "public"."pickup_addresses"
  ADD COLUMN "transfer_color" TEXT;

ALTER TABLE "public"."pickup_addresses"
  ADD CONSTRAINT "pickup_addresses_transfer_color_check"
    CHECK ("transfer_color" ~ '^#[0-9a-f]{6}$');
