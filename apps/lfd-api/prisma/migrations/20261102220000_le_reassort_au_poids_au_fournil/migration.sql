-- LE RÉASSORT AU POIDS, CÔTÉ FOURNIL — lot L2b-2 de
-- `documentation/limites-de-commande/plan-jour-meme-sur-stock.md` (§14).
--
-- Une ligne de réassort porte son unité au commerce depuis L2b-1
-- (`site_resupply_line.sale_unit`). Le fournil la recopie à l'arrêt du soir et
-- au lancement d'un « au plus tôt », comme celle d'une commande (P6,
-- `production_order_line.sale_unit`). Sans elle, une ligne de 2 000 grammes
-- se relirait « 2 000 pièces » au four et sur le bon de réassort.
--
-- ADDITIF : une colonne, née `piece` partout, ce qu'est toute ligne existante
-- (la garde d'envoi de L2b-1 refusait qu'un réassort au poids parte au fournil).
-- Même forme que `order_lines.sale_unit` (TEXT + CHECK, pas un enum Postgres).
--
-- Retour arrière : `prisma/rollback/20261102220000_le_reassort_au_poids_au_fournil.sql`.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_resupply_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "production_resupply_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
