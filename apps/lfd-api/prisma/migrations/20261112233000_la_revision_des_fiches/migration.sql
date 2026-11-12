-- La révision d'une fiche client : montée par chaque enregistrement de
-- l'agrégat société, comparée à celle que l'écran a lue. Additive : toutes les
-- fiches existantes partent de 0.
-- Mieux vaut échouer proprement en 5 s, et se relancer, que de faire attendre
-- toutes les lectures des sociétés derrière une transaction longue.
SET lock_timeout = '5s';

ALTER TABLE "public"."companies" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
