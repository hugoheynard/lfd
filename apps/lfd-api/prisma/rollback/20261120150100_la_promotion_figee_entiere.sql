-- RETOUR ARRIÈRE de 20261120150100_la_promotion_figee_entiere.
-- NON APPLIQUÉ, et Prisma ne le lit pas : remet la forme d origine du CHECK.
ALTER TABLE "public"."orders"
  DROP CONSTRAINT "orders_free_delivery_promotion_whole",
  ADD CONSTRAINT "orders_free_delivery_promotion_whole" CHECK (
    ("free_delivery_promotion_id" IS NULL
      AND "free_delivery_promotion_threshold_cents" IS NULL
      AND "free_delivery_label" IS NULL)
    OR ("free_delivery_promotion_id" IS NOT NULL
      AND "free_delivery_promotion_threshold_cents" IS NOT NULL
      AND "free_delivery_promotion_threshold_cents" >= 0
      AND jsonb_typeof("free_delivery_label") = 'object')
  );
