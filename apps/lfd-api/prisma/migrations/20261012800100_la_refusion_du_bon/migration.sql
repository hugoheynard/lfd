-- LA REFUSION DU BON — deux colonnes, deux contraintes, une unicité partielle
--
-- Plan `documentation/order/plan-annulation-de-commande.md`, lot C3b (C3b.2).
--
-- 1. `merged_back_at`, `merged_back_order_id` : NULLABLES. L'instant de la
--    refusion et la commande annulée qui l'a causée — identifiant opaque, SANS
--    clé étrangère, comme `loyalty_ledger_entries.order_id`.
-- 2. Un reliquat refondu porte les deux, et seul un reliquat refondu les
--    porte ; seul un reliquat (`parent_voucher_id` non nul) se refond.
-- 3. L'unicité de `parent_voucher_id` se RELÂCHE aux reliquats non refondus :
--    un bon rendu puis réengagé doit pouvoir laisser un second reliquat,
--    l'ancien (refondu) restant comme pièce. Le prédicat NOMME les statuts qui
--    bloquent plutôt que d'exclure `merged_back` : une valeur d'enum ajoutée un
--    jour ne bloquera pas — ni ne laissera passer — sans qu'on l'écrive.
--    `expired` et `cancelled` bloquent : la valeur du parent a été consommée
--    puis perdue, il ne doit pas en laisser un second.
--
-- ⚠️ Index ÉCRIT À LA MAIN : Prisma ne sait pas exprimer un index partiel.
-- Le test e2e « refuse deux reliquats non refondus pour le même bon » est la
-- seule défense contre une migration générée qui le supprimerait.
--
-- ADDITIVE : aucune ligne existante n'est touchée (aucune n'est
-- `merged_back`) ; l'unicité ne fait que se relâcher. Retour arrière : recréer
-- `loyalty_vouchers_parent_voucher_id_key` (possible tant qu'aucun bon n'a deux
-- reliquats), supprimer l'index partiel, les deux contraintes et les deux
-- colonnes.

ALTER TABLE "public"."loyalty_vouchers"
  ADD COLUMN "merged_back_at" TIMESTAMPTZ(3),
  ADD COLUMN "merged_back_order_id" TEXT;

ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_merge_back_complete" CHECK (
  ("status" = 'merged_back') = ("merged_back_at" IS NOT NULL AND "merged_back_order_id" IS NOT NULL)
);

ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_merge_back_remainder_only" CHECK (
  "status" <> 'merged_back' OR "parent_voucher_id" IS NOT NULL
);

DROP INDEX "public"."loyalty_vouchers_parent_voucher_id_key";

CREATE UNIQUE INDEX "loyalty_vouchers_live_remainder_key" ON "public"."loyalty_vouchers"("parent_voucher_id")
  WHERE "status" IN ('available', 'reserved', 'expired', 'cancelled');
