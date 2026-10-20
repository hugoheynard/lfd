-- La société d'un abonnement (plan-notifications-sous-comptes.md, N4e).
--
-- Additive : une colonne NULLABLE, son index, sa clé étrangère. Aucune donnée
-- n'est réécrite : les abonnements existants gardent `company_id` à NULL — une
-- personne rattachée à deux sociétés rend leur site indécidable, et on ne
-- devine pas. Un geste sur eux ne prévient aucun principal. Aucun droit n'est
-- accordé à un rôle.
--
-- `ON DELETE RESTRICT`, comme `orders.principal_company_id` : une société ne
-- se supprime pas physiquement, et `SET NULL` effacerait en silence le seul
-- lien entre un abonnement et son site.
--
-- Retour arrière :
--   ALTER TABLE "public"."subscriptions" DROP COLUMN "company_id";

-- AlterTable
ALTER TABLE "public"."subscriptions" ADD COLUMN     "company_id" TEXT;

-- CreateIndex
CREATE INDEX "subscriptions_company_id_idx" ON "public"."subscriptions"("company_id");

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
