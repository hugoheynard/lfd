-- Lot 7 ter (L7t-C1) : la marge de sécurité avant la fin d'un créneau.
-- ADDITIVE : une colonne neuve, NOT NULL DEFAULT 20 — la ligne déjà posée
-- reçoit la valeur de Hugo, aucun appelant ne casse.
ALTER TABLE "production"."delivery_routing_settings"
  ADD COLUMN "safety_margin_minutes" INTEGER NOT NULL DEFAULT 20;
