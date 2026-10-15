-- UN SITE PEUT ÊTRE RÉSERVÉ AU RETRAIT D'UNE CLIENTÈLE (Hugo, 2026-10-15)
--
-- « Imaginons que mes pros ne peuvent plus retirer qu'à une seule boutique » :
-- deux cases sur le site, réglées à l'écran (Réglages › Sites), jamais en dur.
--
-- ADDITIVE : deux colonnes `NOT NULL DEFAULT true` — l'existant, où tout site
-- qui remet remet aux deux clientèles. Aucune ligne n'est réécrite.
--
-- Le CHECK tient ce que l'agrégat `Site` refuse déjà : un site qui fait du
-- retrait l'ouvre à au moins une clientèle. Un site sans retrait garde ses
-- cases telles quelles. Toutes les lignes existantes le satisfont (défauts).
--
-- Retour arrière : supprimer la contrainte puis les deux colonnes.

ALTER TABLE "public"."pickup_addresses"
  ADD COLUMN "pickup_for_b2b" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pickup_for_b2c" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "public"."pickup_addresses"
  ADD CONSTRAINT "pickup_addresses_pickup_audience_check"
  CHECK (NOT "pickup" OR "pickup_for_b2b" OR "pickup_for_b2c");
