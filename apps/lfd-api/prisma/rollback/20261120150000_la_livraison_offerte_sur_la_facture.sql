-- Retour arrière de 20261120150000_la_livraison_offerte_sur_la_facture.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ». Les mentions figées depuis sont perdues.
ALTER TABLE "public"."invoice_order" DROP COLUMN IF EXISTS "free_delivery";
