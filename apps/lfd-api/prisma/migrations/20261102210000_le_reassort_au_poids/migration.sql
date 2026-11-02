-- LE RÉASSORT AU POIDS, CÔTÉ COMMERCE — lot L2b-1 de
-- `documentation/limites-de-commande/plan-jour-meme-sur-stock.md` (§14).
--
-- Chaque ligne demandée et chaque ligne reçue porte l'unité de sa quantité,
-- figée à l'ajout de la ligne (lue au catalogue publié) : `piece` ou `weight`
-- (la quantité compte alors des GRAMMES). Même forme que
-- `order_lines.sale_unit` (TEXT + CHECK, pas un enum Postgres).
--
-- ADDITIF : deux colonnes, nées `piece` partout, ce qu'est toute ligne
-- existante (`resuppliable` refusait le poids avant ce lot).
--
-- Le brouillon du fournil (`bakehouse_resupply_drafts.lines`, jsonb) n'est pas
-- migré : une ligne sans clé `saleUnit` se lit `piece`.
--
-- Retour arrière : `prisma/rollback/20261102210000_le_reassort_au_poids.sql`.

SET lock_timeout = '5s';

ALTER TABLE "public"."site_resupply_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "site_resupply_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));

ALTER TABLE "public"."resupply_receipt_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "resupply_receipt_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
