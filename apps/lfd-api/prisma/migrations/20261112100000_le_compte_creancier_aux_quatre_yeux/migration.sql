-- Le compte créancier de l'entité émettrice aux quatre yeux
-- (documentation/comptabilite/plan-paiement-au-compte-par-virement.md, lot T0).
--
-- ADDITIVE, aucune ligne réécrite :
--
-- 1. Le compte PROPOSÉ, en attente de la confirmation d'un second membre de la
--    comptabilité : identifiant, IBAN scellé (comme `creditor_iban_sealed`),
--    BIC, titulaire, adresse, auteur (id de fiche staff) et instant. Toutes
--    nulles = rien en attente — l'état de toutes les entités existantes.
-- 2. Un CHECK : une saisie en attente n'existe pas à moitié.
-- 3. `version`, le verrou optimiste de l'agrégat, à 0 pour toutes.
--
-- Retour arrière : `prisma/rollback/20261112100000_le_compte_creancier_aux_quatre_yeux.sql`.

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "pending_creditor_account_id" TEXT,
  ADD COLUMN "pending_creditor_iban_sealed" TEXT,
  ADD COLUMN "pending_creditor_bic" TEXT,
  ADD COLUMN "pending_creditor_account_holder" TEXT,
  ADD COLUMN "pending_creditor_account_line1" TEXT,
  ADD COLUMN "pending_creditor_account_line2" TEXT,
  ADD COLUMN "pending_creditor_account_postal_code" TEXT,
  ADD COLUMN "pending_creditor_account_city" TEXT,
  ADD COLUMN "pending_creditor_account_country_code" TEXT,
  ADD COLUMN "pending_creditor_account_proposed_by_staff_id" TEXT,
  ADD COLUMN "pending_creditor_account_proposed_at" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."legal_entities"
  ADD CONSTRAINT "legal_entity_pending_creditor_account_whole" CHECK (
    (
      "pending_creditor_account_id" IS NULL
      AND "pending_creditor_iban_sealed" IS NULL
      AND "pending_creditor_bic" IS NULL
      AND "pending_creditor_account_holder" IS NULL
      AND "pending_creditor_account_line1" IS NULL
      AND "pending_creditor_account_line2" IS NULL
      AND "pending_creditor_account_postal_code" IS NULL
      AND "pending_creditor_account_city" IS NULL
      AND "pending_creditor_account_country_code" IS NULL
      AND "pending_creditor_account_proposed_by_staff_id" IS NULL
      AND "pending_creditor_account_proposed_at" IS NULL
    )
    OR (
      "pending_creditor_account_id" IS NOT NULL
      AND "pending_creditor_iban_sealed" IS NOT NULL
      AND "pending_creditor_bic" IS NOT NULL
      AND "pending_creditor_account_holder" IS NOT NULL
      AND "pending_creditor_account_line1" IS NOT NULL
      AND "pending_creditor_account_line2" IS NOT NULL
      AND "pending_creditor_account_postal_code" IS NOT NULL
      AND "pending_creditor_account_city" IS NOT NULL
      AND "pending_creditor_account_country_code" IS NOT NULL
      AND "pending_creditor_account_proposed_by_staff_id" IS NOT NULL
      AND "pending_creditor_account_proposed_at" IS NOT NULL
    )
  );
