-- Retour arrière de 20261120160100_la_trace_de_la_commande_non_retiree.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- Ne se joue que si aucune ligne n'est `no_show` : la trace de qui l'a
-- déclarée, et de qui a prévenu le client, serait perdue.
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_no_show_notice_together";
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_no_show_together";
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_no_show_shop_till";
ALTER TABLE "public"."orders"
  DROP COLUMN IF EXISTS "no_show_notice_requested_by_staff_id",
  DROP COLUMN IF EXISTS "no_show_notice_requested_at",
  DROP COLUMN IF EXISTS "no_show_by_staff_id",
  DROP COLUMN IF EXISTS "no_show_at";
