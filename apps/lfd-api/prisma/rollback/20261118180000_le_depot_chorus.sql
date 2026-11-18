-- RETOUR ARRIÈRE de 20261118180000_le_depot_chorus
-- (documentation/comptabilite/facturation/plan-clients-publics-chorus.md, P3).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- Le code d'avant ignore la table : le retour arrière est d'abord le retour
-- du code seul. ⚠️ Les dépôts saisis restent en base, et l'échéance des
-- factures publiques redevient celle imprimée (émission + délai légal).
--
-- Retirer la table perdrait la trace des dépôts : resserrement ultérieur, sur
-- décision de Hugo, et seulement si elle est vide :
--
--   SELECT count(*) FROM "public"."invoice_chorus_deposit";
--   DROP TRIGGER "invoice_chorus_deposit_append_only" ON "public"."invoice_chorus_deposit";
--   DROP FUNCTION "public"."invoice_chorus_deposit_append_only"();
--   DROP TABLE "public"."invoice_chorus_deposit";

SELECT 1;
