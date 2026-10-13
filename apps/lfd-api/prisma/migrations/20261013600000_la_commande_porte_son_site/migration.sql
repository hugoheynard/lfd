-- Lot S2 des sites (documentation/sites/sites.md, §7) : le bon du fournil
-- garde le site qui remet un retrait.
--
-- Additive : une colonne nullable, sans défaut ni rattrapage. Un identifiant
-- OPAQUE du commerce, sans clé étrangère — le schéma `production` ne référence
-- jamais `public` (CLAUDE.md §3). Les journées déjà figées et les commandes
-- passées avant le lot restent à NULL : le snapshot `orders.pickup_address`
-- ne portait pas l'id, et un rattrapage par libellé serait irréversible (Q-S2).
ALTER TABLE "production"."production_order" ADD COLUMN "site_id" TEXT;
