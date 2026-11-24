-- La migration INVERSE du bloc des paniers récurrents
-- (`20261125090000_le_bloc_des_paniers_recurrents`, plan
-- `documentation/commandes/paniers-recurrents/plan-bloc-recurrent.md`, § 8 bis).
--
-- Ce n'est PAS une migration du dépôt : un retour arrière, gardé prêt parce
-- que la migration est irréversible par simple redéploiement de l'image
-- précédente (elle retire des tables que l'ancien code lit). À jouer à la main
-- (`prisma db execute`), puis l'ancienne image redéployée, et la ligne de la
-- migration retirée de `_prisma_migrations`.
--
-- Il ne recopie RIEN : il suppose qu'aucun panier n'a été ouvert entre-temps,
-- comme la migration d'aller le supposait des anciennes tables. Le garde-fou
-- ci-dessous l'arrête sinon.
--
-- D'où il vient :
--   1. la partie « à la main » d'abord : ce que `prisma migrate diff` ne voit
--      pas (le déclencheur et sa fonction, posés en SQL par l'aller) ;
--   2. puis le SQL GÉNÉRÉ le 2026-11-24 par
--        prisma migrate diff --from-schema prisma/schema \
--          --to-schema <prisma/schema de HEAD avant le lot> --script
--      recopié tel quel ;
--   3. enfin, à la main, ce que les migrations d'avant avaient posé en SQL et
--      que le schéma Prisma ne dit pas : le CHECK du registre
--      (`20261123140000_le_registre_des_echeances`) et les trois déclencheurs
--      du journal des sociétés sur `subscriptions`
--      (`20261112180000_les_journaux_des_comptes_et_des_commandes`).
--
-- Écarts connus avec la base d'avant, sans effet sur l'ancien code : les
-- horodatages des tables recréées sont rendus comme le schéma les déclare
-- (`TIMESTAMP(3)`), et les index et contraintes portent les noms que Prisma
-- leur donne aujourd'hui.

-- ─── 0. Le garde-fou : rien à perdre ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "recurring"."basket")
    OR EXISTS (SELECT 1 FROM "public"."orders" WHERE "from_occurrence_day" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Des paniers récurrents existent dans le schéma recurring : la migration inverse ne les supprime pas. Les reprendre avant de revenir en arrière.';
  END IF;
END $$;

-- ─── 1. À la main : le déclencheur de la provenance ──────────────────────────
DROP TRIGGER "orders_keep_recurring_provenance" ON "public"."orders";
DROP FUNCTION "public"."orders_keep_recurring_provenance"();
DROP INDEX "public"."orders_one_per_occurrence";

-- ─── 2. Généré par `prisma migrate diff` ─────────────────────────────────────
-- DropForeignKey
ALTER TABLE "recurring"."basket_line" DROP CONSTRAINT "basket_line_basket_id_fkey";

-- DropForeignKey
ALTER TABLE "recurring"."occurrence" DROP CONSTRAINT "occurrence_basket_id_fkey";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "from_occurrence_day";

-- DropTable
DROP TABLE "recurring"."basket";

-- DropTable
DROP TABLE "recurring"."basket_line";

-- DropTable
DROP TABLE "recurring"."occurrence";

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "placed_by_user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "from_order_id" TEXT,
    "recurrence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "fulfillment_method" "FulfillmentMethod" NOT NULL,
    "delivery_address_snapshot" JSONB,
    "pickup_address_id" TEXT,
    "requested_window" JSONB,
    "note" TEXT NOT NULL DEFAULT '',
    "armed_from" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_occurrences" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "occurrence_date" DATE NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_lines" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "subscription_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_occurrence_runs" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "occurrence_date" DATE NOT NULL,
    "outcome" TEXT NOT NULL,
    "order_id" TEXT,
    "cause" TEXT,
    "reason" TEXT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_occurrence_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_placed_by_user_id_idx" ON "subscriptions"("placed_by_user_id");

-- CreateIndex
CREATE INDEX "subscriptions_company_id_idx" ON "subscriptions"("company_id");

-- CreateIndex
CREATE INDEX "subscription_occurrences_subscription_id_idx" ON "subscription_occurrences"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_occurrences_subscription_id_occurrence_date_key" ON "subscription_occurrences"("subscription_id", "occurrence_date");

-- CreateIndex
CREATE INDEX "subscription_lines_subscription_id_idx" ON "subscription_lines"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_occurrence_runs_subscription_id_occurrence_date_ke" ON "subscription_occurrence_runs"("subscription_id", "occurrence_date");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_placed_by_user_id_fkey" FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_occurrences" ADD CONSTRAINT "subscription_occurrences_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_occurrence_runs" ADD CONSTRAINT "subscription_occurrence_runs_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DROP SCHEMA "recurring";

-- ─── 3. À la main : ce que les migrations d'avant avaient posé en SQL ────────
ALTER TABLE "subscription_occurrence_runs"
  ADD CONSTRAINT "subscription_occurrence_runs_outcome_shape" CHECK (
    ("outcome" = 'generated' AND "order_id" IS NOT NULL AND "cause" IS NULL AND "reason" IS NULL)
    OR ("outcome" IN ('refused', 'missed_deadline')
        AND "order_id" IS NULL AND "cause" IS NOT NULL AND "reason" IS NOT NULL)
  );

CREATE TRIGGER "subscriptions_company_change_insert"
  AFTER INSERT ON "public"."subscriptions"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "subscriptions_company_change_update"
  AFTER UPDATE ON "public"."subscriptions"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "subscriptions_company_change_delete"
  AFTER DELETE ON "public"."subscriptions"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
