-- LE JEU ENTRE BACS — `delivery.delivery_routing_settings`
--
-- Doc `documentation/livraisons/chargement/plan-piles-au-sol-revues.md`, P1
-- (G5a revue par Hugo le 2026-10-08 : « ça doit être une donnée »). Le plan
-- de chargement lisait une constante de 1 cm ; il lit désormais ce réglage.
--
-- Purement additive : une colonne NOT NULL DEFAULT 1 — la ligne déjà posée
-- reçoit la valeur que le plan lisait, rien ne change pour elle — et un
-- CHECK 0 à 10 cm, la borne de l'assistant d'achat. Aucun droit accordé.
-- Retour arrière : supprimer la contrainte, puis la colonne.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_routing_settings"
    ADD COLUMN "bin_gap_cm" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "delivery"."delivery_routing_settings"
    ADD CONSTRAINT "delivery_routing_bin_gap_cm" CHECK ("bin_gap_cm" BETWEEN 0 AND 10);
