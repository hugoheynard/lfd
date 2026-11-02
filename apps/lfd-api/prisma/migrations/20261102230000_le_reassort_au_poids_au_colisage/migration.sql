-- LE RÉASSORT AU POIDS, AU COLISAGE — lot L2b-3 de
-- `documentation/limites-de-commande/plan-jour-meme-sur-stock.md` (§14).
--
-- Le fournil fige l'unité d'une ligne de réassort depuis L2b-2
-- (`production.production_resupply_line.sale_unit`) et la publie dans le fait
-- `production.resupply_list_drawn` depuis L2b-3. La fiche du colisage la
-- recopie : sans elle, 2 000 grammes se reliraient « 2 000 pièces » à
-- l'emballé, à la réception pré-remplie et au manifeste du transfert.
--
-- ADDITIF : une colonne, née `piece` partout, ce qu'est toute ligne existante
-- (la garde d'envoi de L2b-1 refusait qu'un réassort au poids parte au fournil).
-- Même forme que `order_lines.sale_unit` (TEXT + CHECK, pas un enum Postgres).
--
-- Retour arrière : `prisma/rollback/20261102230000_le_reassort_au_poids_au_colisage.sql`.

SET lock_timeout = '5s';

ALTER TABLE "packing"."packing_resupply_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "packing_resupply_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
