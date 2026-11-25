-- Le « Retrait immédiat » du comptoir sans vérifier le stock reçu, réglé
-- point par point (Réglages › Comptoir, décidé par Hugo le 2026-11-25 ;
-- limites-de-commande/jour-meme-sur-stock.md § 8).
--
-- ADDITIVE : une colonne à défaut `false`, la vérification d'aujourd'hui.
-- Aucun droit n'est accordé.

SET lock_timeout = '5s';

ALTER TABLE "public"."counter_stock_settings"
  ADD COLUMN "immediate_without_stock" BOOLEAN NOT NULL DEFAULT false;
