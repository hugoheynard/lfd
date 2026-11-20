-- Retour arrière de 20261120130000_le_lieu_de_reglement, après celui de
-- 20261120130100.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- Ne se joue que si aucune ligne n'a de lieu : une commande `shop_till`
-- perdrait la seule trace de l'endroit où elle se règle.
ALTER TABLE "public"."orders" DROP COLUMN IF EXISTS "settlement_venue";
DROP TYPE IF EXISTS "public"."SettlementVenue";
