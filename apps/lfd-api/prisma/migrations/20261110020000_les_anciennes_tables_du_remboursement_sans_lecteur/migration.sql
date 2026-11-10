-- LES ANCIENNES TABLES DU REMBOURSEMENT, SANS LECTEUR — plan
-- `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
-- lot P1.c, §5.1, §5.4.
--
-- Les relations Prisma `Order.refunds`, `Order.refundRequest` et
-- `Invoice.refunds` sont retirées du schéma : le remboursement par carte vit
-- dans `card_payment` (copié par `20261110010200_la_copie_des_remboursements`),
-- et plus rien dans `src/` ne lit ni n'écrit `public.order_refund` ni
-- `public.order_refund_request`. Cette migration ne fait QUE supprimer les
-- trois clés étrangères que ces relations portaient.
--
-- 🔴 ADDITIVE AU SENS DU § 0 : aucune table, aucune colonne, aucune ligne
-- supprimée. Les deux tables restent intactes — elles font foi jusqu'à P2,
-- qui les retirera — ; seules leurs clés tombent, pour qu'une commande ou un
-- avoir ne soit plus tenu par une table sans écrivain. Les index
-- (`order_refund_order_id_idx`, l'unicité de `stripe_refund_id` et de
-- `credit_note_id`) et le déclencheur `order_refund_credit_note_once` restent.
--
-- Généré par `prisma migrate diff` contre une base migrée, puis réduit à ces
-- trois instructions : le reste du diff est la dérive connue entre le SQL
-- écrit à la main et le schéma, sans rapport avec ce lot.

-- DropForeignKey
ALTER TABLE "public"."order_refund" DROP CONSTRAINT "order_refund_credit_note_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."order_refund" DROP CONSTRAINT "order_refund_order_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."order_refund_request" DROP CONSTRAINT "order_refund_request_order_id_fkey";
