-- Quel ÉTAGE de plancher a mordu sur cette ligne, et sur quelles preuves.
--
-- Nullable comme les trois colonnes de trace posées plus tôt, et pour la même
-- raison : une commande antérieure n'en a pas, et lui en inventer une
-- transformerait une ignorance en affirmation.
ALTER TABLE "order_lines" ADD COLUMN "pricing_floor" JSONB;
