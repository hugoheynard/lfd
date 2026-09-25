-- LE PRÉLÈVEMENT SE BLOQUE — lot 1 du plan « blocage du prélèvement et liens
-- de paiement » (§1).
--
-- Un agent de la comptabilité peut suspendre le règlement AU COMPTE d'une
-- société à qui le mensuel a été accordé : ses commandes à venir se règlent par
-- carte, et le crédit accordé (`granted_terms`) n'est pas touché — débloquer le
-- rend tel quel. Les commandes déjà passées au compte restent dans leur cycle.
--
-- **Additif** : trois colonnes nullables, sans défaut ni réécriture ; une
-- contrainte que toutes les lignes existantes satisfont (les trois sont NULL).
--
-- Retour arrière, dans cet ordre :
--   ALTER TABLE "public"."companies" DROP CONSTRAINT "companies_direct_debit_block_complete";
--   ALTER TABLE "public"."companies" DROP COLUMN "direct_debit_block_reason";
--   ALTER TABLE "public"."companies" DROP COLUMN "direct_debit_blocked_by";
--   ALTER TABLE "public"."companies" DROP COLUMN "direct_debit_blocked_at";
--
-- Plan : documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md

ALTER TABLE "public"."companies" ADD COLUMN "direct_debit_blocked_at" TIMESTAMP(3);
ALTER TABLE "public"."companies" ADD COLUMN "direct_debit_blocked_by" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "direct_debit_block_reason" TEXT;

-- Un blocage sans instant, sans auteur ou sans raison n'est pas un blocage :
-- les trois sont nulles ensemble ou posées ensemble.
ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_direct_debit_block_complete" CHECK (
  ("direct_debit_blocked_at" IS NULL AND "direct_debit_blocked_by" IS NULL AND "direct_debit_block_reason" IS NULL)
  OR ("direct_debit_blocked_at" IS NOT NULL AND "direct_debit_blocked_by" IS NOT NULL AND "direct_debit_block_reason" IS NOT NULL)
);
