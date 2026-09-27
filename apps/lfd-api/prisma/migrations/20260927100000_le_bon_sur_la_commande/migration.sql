-- Lot C des points de fidélité : le bon de fidélité sur la commande
-- (documentation/comptabilite/plan-points-de-fidelite.md, §11 et §11 bis).
--
-- Purement ADDITIVE : une valeur d'enum, deux colonnes à défaut, un index, une
-- clé étrangère, et un CHECK RELÂCHÉ (aucune ligne existante ne peut le violer,
-- puisque l'ancien était plus strict).

-- ─── Le bon engagé sur une commande vivante ────────────────────────────────
-- ⚠️ Une valeur ajoutée ne s'emploie pas dans la même transaction : rien
-- ci-dessous ne cite 'reserved'.
ALTER TYPE "public"."LoyaltyVoucherStatus" ADD VALUE 'reserved';

-- ─── La commande porte le bon, et ce qu'il a réellement imputé ─────────────
ALTER TABLE "public"."orders" ADD COLUMN "voucher_discount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."orders" ADD COLUMN "loyalty_voucher_id" TEXT;

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_voucher_discount_non_negative" CHECK ("voucher_discount_cents" >= 0);

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_loyalty_voucher_id_fkey" FOREIGN KEY ("loyalty_voucher_id") REFERENCES "public"."loyalty_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un bon ne sert qu'à UNE commande vivante (§11 bis, B3). Partiel : une
-- commande annulée garde la trace du bon, que la libération a rendu
-- réutilisable — une unicité pleine interdirait de le dépenser à nouveau.
-- Prisma ne sait pas l'exprimer : il n'apparaît pas dans le schéma.
CREATE UNIQUE INDEX "orders_loyalty_voucher_live_key" ON "public"."orders"("loyalty_voucher_id") WHERE "status" <> 'cancelled';

-- ─── Un reliquat ne coûte aucun point (§11 bis, B1) ────────────────────────
-- Ses points ont été payés par le bon d'origine. Seul un reliquat
-- (`parent_voucher_id`) peut coûter zéro ; un bon d'origine coûte toujours.
ALTER TABLE "public"."loyalty_vouchers" DROP CONSTRAINT "loyalty_vouchers_amounts_positive";
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_amounts_positive" CHECK (
  "value_cents" > 0 AND "points_cost" >= 0
  AND ("points_cost" > 0 OR "parent_voucher_id" IS NOT NULL)
  AND "ratio_points_per_step" > 0 AND "ratio_step_value_cents" > 0
);

-- ─── Le solde du reliquat est une marque, pas une déduction ────────────────
-- Posée sur le bon PARENT quand sa commande devient définitive, quel que soit
-- le cas : reliquat émis, reliquat éteint (bon échu), ou rien à émettre. Sans
-- elle, le passage de nuit relirait sans fin un bon échu ou entièrement imputé
-- (plan des points, §11 bis B2, décision du 2026-09-27).
ALTER TABLE "public"."loyalty_vouchers" ADD COLUMN "remainder_settled_at" TIMESTAMPTZ(3);
CREATE INDEX "loyalty_vouchers_reserved_unsettled_idx" ON "public"."loyalty_vouchers"("id") WHERE "status" = 'reserved' AND "remainder_settled_at" IS NULL;
