-- Les avis au principal, lot N1 (plan-notifications-sous-comptes.md, §3).
--
-- Additive : deux colonnes NULLABLES sur `orders`, un enum, deux tables neuves.
-- Aucune donnée n'est réécrite : les commandes déjà passées gardent
-- `principal_company_id` et `principal_sees_amount` à NULL (« d'avant la
-- colonne »), sans remplissage rétroactif — aucun historique des
-- rattachements ne dirait quel était leur principal. Aucun droit n'est
-- accordé à un rôle : l'écran se règle sous `b2b_companies`, déjà existant.
--
-- Retour arrière :
--   DROP TABLE "public"."sub_account_notice_sends";
--   DROP TABLE "public"."sub_account_notice_rules";
--   DROP TYPE "public"."SubAccountNoticeKind";
--   ALTER TABLE "public"."orders" DROP COLUMN "principal_sees_amount",
--     DROP COLUMN "principal_company_id";

-- CreateEnum
CREATE TYPE "public"."SubAccountNoticeKind" AS ENUM ('order_placed', 'order_cancelled', 'payment_failed', 'subscription_changed', 'delivery_address_changed', 'contact_changed', 'bank_account_changed', 'order_problem_reported');

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "principal_company_id" TEXT,
ADD COLUMN     "principal_sees_amount" BOOLEAN;

-- CreateTable
CREATE TABLE "public"."sub_account_notice_rules" (
    "principal_company_id" TEXT NOT NULL,
    "kind" "public"."SubAccountNoticeKind" NOT NULL,
    "role" "public"."CustomerRole" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sub_account_notice_rules_pkey" PRIMARY KEY ("principal_company_id","kind","role")
);

-- CreateTable
CREATE TABLE "public"."sub_account_notice_sends" (
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sub_account_notice_sends_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateIndex
CREATE INDEX "sub_account_notice_sends_user_id_idx" ON "public"."sub_account_notice_sends"("user_id");

-- CreateIndex
CREATE INDEX "orders_principal_company_id_idx" ON "public"."orders"("principal_company_id");

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_principal_company_id_fkey" FOREIGN KEY ("principal_company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sub_account_notice_rules" ADD CONSTRAINT "sub_account_notice_rules_principal_company_id_fkey" FOREIGN KEY ("principal_company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sub_account_notice_sends" ADD CONSTRAINT "sub_account_notice_sends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
