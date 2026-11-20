-- Retour arrière de 20261120130100_la_forme_du_reglement_en_boutique.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
DROP TRIGGER IF EXISTS "orders_settlement_venue_frozen" ON "public"."orders";
DROP FUNCTION IF EXISTS "public"."orders_settlement_venue_frozen"();
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_shop_till_shape";
