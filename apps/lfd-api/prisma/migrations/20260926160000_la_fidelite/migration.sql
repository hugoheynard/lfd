-- LA FIDÉLITÉ — lot A du plan des points de fidélité.
--
-- Plan : documentation/comptabilite/plan-points-de-fidelite.md (D1, D2, D5, D7).
--
-- Un grand livre de points par titulaire (la société pour un pro, la personne
-- pour un particulier), des bons d'achat nés d'une conversion, et le réglage du
-- ratio. **Additif** : deux types, trois tables neuves, aucune colonne
-- existante touchée. Aucune ligne n'est semée : sans réglage, le programme est
-- fermé.
--
-- 🔴 Les clés étrangères vers `companies` et `users` sont `RESTRICT` : un livre
-- ne s'efface pas. Vérifié le 2026-09-26 : aucun chemin applicatif ne supprime
-- une société ni une personne ; seuls les scripts de semis de dev le font
-- (`src/dev/seeding/reset.seed.ts`, `prisma/reset-growth.ts`,
-- `prisma/seed-fiche.ts`, `prisma/clone-dev.ts`), et ils échoueront sur un
-- titulaire qui a des lignes. `actor_user_id` fait exception (`SET NULL`) :
-- l'auteur d'un geste n'est pas le titulaire.
--
-- Retour arrière, dans cet ordre :
--   DROP TABLE "public"."loyalty_ledger_entries";
--   DROP TABLE "public"."loyalty_vouchers";
--   DROP TABLE "public"."loyalty_settings";
--   DROP TYPE "public"."LoyaltyVoucherStatus";
--   DROP TYPE "public"."LoyaltyEntryKind";

-- CreateEnum
CREATE TYPE "public"."LoyaltyEntryKind" AS ENUM ('earned', 'converted', 'adjusted');

-- CreateEnum
CREATE TYPE "public"."LoyaltyVoucherStatus" AS ENUM ('available', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "public"."loyalty_settings" (
    "id" TEXT NOT NULL,
    "points_per_step" INTEGER NOT NULL,
    "step_value_cents" INTEGER NOT NULL,
    "open_to_public" BOOLEAN NOT NULL,
    "open_to_pro" BOOLEAN NOT NULL,
    "voucher_validity_days" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_ledger_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT,
    "kind" "public"."LoyaltyEntryKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "order_id" TEXT,
    "voucher_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT,
    "staff_user_id" TEXT,
    "reason" TEXT,

    CONSTRAINT "loyalty_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_vouchers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT,
    "value_cents" INTEGER NOT NULL,
    "points_cost" INTEGER NOT NULL,
    "ratio_points_per_step" INTEGER NOT NULL,
    "ratio_step_value_cents" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "public"."LoyaltyVoucherStatus" NOT NULL,
    "parent_voucher_id" TEXT,
    "expired_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_staff_id" TEXT,
    "cancellation_reason" TEXT,

    CONSTRAINT "loyalty_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_company_id_idx" ON "public"."loyalty_ledger_entries"("company_id");

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_user_id_idx" ON "public"."loyalty_ledger_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_vouchers_parent_voucher_id_key" ON "public"."loyalty_vouchers"("parent_voucher_id");

-- CreateIndex
CREATE INDEX "loyalty_vouchers_company_id_idx" ON "public"."loyalty_vouchers"("company_id");

-- CreateIndex
CREATE INDEX "loyalty_vouchers_user_id_idx" ON "public"."loyalty_vouchers"("user_id");

-- CreateIndex
CREATE INDEX "loyalty_vouchers_status_expires_at_idx" ON "public"."loyalty_vouchers"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."loyalty_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_parent_voucher_id_fkey" FOREIGN KEY ("parent_voucher_id") REFERENCES "public"."loyalty_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Le réglage ─────────────────────────────────────────────────────────────

-- Une seule ligne, et un ratio fait d'entiers strictement positifs : un palier
-- à zéro point donnerait des bons gratuits, un palier à zéro centime des bons
-- vides.
ALTER TABLE "public"."loyalty_settings" ADD CONSTRAINT "loyalty_settings_single_row" CHECK ("id" = 'default');
ALTER TABLE "public"."loyalty_settings" ADD CONSTRAINT "loyalty_settings_ratio_positive" CHECK ("points_per_step" > 0 AND "step_value_cents" > 0);
ALTER TABLE "public"."loyalty_settings" ADD CONSTRAINT "loyalty_settings_validity_positive" CHECK ("voucher_validity_days" > 0);

-- ─── Le grand livre ─────────────────────────────────────────────────────────

-- Le titulaire : la société OU la personne, jamais les deux, jamais aucun.
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_one_holder" CHECK (("company_id" IS NULL) <> ("user_id" IS NULL));

-- Chaque sorte de ligne a son signe et cite ce qui la justifie. Une ligne à
-- zéro point ne dit rien.
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_kind_shape" CHECK (
  ("kind" = 'earned' AND "points" > 0 AND "order_id" IS NOT NULL)
  OR ("kind" = 'converted' AND "points" < 0 AND "voucher_id" IS NOT NULL)
  OR ("kind" = 'adjusted' AND "points" <> 0 AND "staff_user_id" IS NOT NULL
      AND "reason" IS NOT NULL AND btrim("reason") <> '')
);

-- Un rejeu n'écrit rien de plus : une commande ne rapporte qu'une fois, un bon
-- ne se paie qu'une fois, et un bon annulé ne se recrédite qu'une fois.
CREATE UNIQUE INDEX "loyalty_ledger_entries_earned_order_key" ON "public"."loyalty_ledger_entries"("order_id") WHERE "kind" = 'earned';
CREATE UNIQUE INDEX "loyalty_ledger_entries_converted_voucher_key" ON "public"."loyalty_ledger_entries"("voucher_id") WHERE "kind" = 'converted';
CREATE UNIQUE INDEX "loyalty_ledger_entries_adjusted_voucher_key" ON "public"."loyalty_ledger_entries"("voucher_id") WHERE "kind" = 'adjusted' AND "voucher_id" IS NOT NULL;

-- ─── Les bons ───────────────────────────────────────────────────────────────

ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_one_holder" CHECK (("company_id" IS NULL) <> ("user_id" IS NULL));

ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_amounts_positive" CHECK (
  "value_cents" > 0 AND "points_cost" > 0
  AND "ratio_points_per_step" > 0 AND "ratio_step_value_cents" > 0
);

-- Un bon d'origine vaut exactement ses paliers entiers, au ratio qu'il fige.
-- Un reliquat (lot C) n'y est pas soumis : il vaut ce qui reste.
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_whole_steps" CHECK (
  "parent_voucher_id" IS NOT NULL
  OR ("points_cost" % "ratio_points_per_step" = 0
      AND "value_cents" = ("points_cost" / "ratio_points_per_step") * "ratio_step_value_cents")
);

ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_expires_after_issue" CHECK ("expires_at" > "issued_at");

-- Une annulation porte son instant, son auteur et son motif ; une expiration
-- son instant. Aucun de ces champs n'existe hors de son état.
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_cancellation_complete" CHECK (
  ("status" = 'cancelled' AND "cancelled_at" IS NOT NULL AND "cancelled_by_staff_id" IS NOT NULL
   AND "cancellation_reason" IS NOT NULL AND btrim("cancellation_reason") <> '')
  OR ("status" <> 'cancelled' AND "cancelled_at" IS NULL AND "cancelled_by_staff_id" IS NULL
      AND "cancellation_reason" IS NULL)
);
ALTER TABLE "public"."loyalty_vouchers" ADD CONSTRAINT "loyalty_vouchers_expiry_complete" CHECK (("status" = 'expired') = ("expired_at" IS NOT NULL));
