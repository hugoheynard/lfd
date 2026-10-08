-- LES MENTIONS DE PAIEMENT DE LA FACTURE — lot E0
-- (`documentation/facturation/plan-emission-de-la-facture.md`)
--
-- ADDITIVE : trois colonnes nullables sur l'entité émettrice, sans défaut.
-- NULL = « à renseigner » ; aucune ligne existante n'est réécrite, et aucune
-- valeur n'est posée d'office — le taux légal (BCE + 10 points) n'est qu'une
-- suggestion d'écran (Q4, Hugo, 2026-10-08).
--
-- - `invoice_late_penalty_rate_bp` : le taux des pénalités de retard, en
--   points de base (1 % = 100), de 1 à 10 000.
-- - `invoice_recovery_indemnity_cents` : l'indemnité forfaitaire de
--   recouvrement, en centimes, de 4 000 (40 €) à 100 000.
-- - `invoice_early_payment_discount` : les conditions d'escompte, en clair
--   (« néant » proposé), 1 à 200 caractères.
--
-- Les bornes sont tenues par l'agrégat (`InvoicePaymentTerms`) ; les CHECK
-- refusent ce qu'une main tierce écrirait hors d'elles.
--
-- Retour arrière : supprimer les CHECK puis les colonnes, une fois qu'aucun
-- binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "invoice_late_penalty_rate_bp" INTEGER,
  ADD COLUMN "invoice_recovery_indemnity_cents" INTEGER,
  ADD COLUMN "invoice_early_payment_discount" TEXT;

ALTER TABLE "public"."legal_entities"
  ADD CONSTRAINT "legal_entities_invoice_late_penalty_rate_range"
    CHECK ("invoice_late_penalty_rate_bp" IS NULL OR "invoice_late_penalty_rate_bp" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "legal_entities_invoice_recovery_indemnity_range"
    CHECK ("invoice_recovery_indemnity_cents" IS NULL OR "invoice_recovery_indemnity_cents" BETWEEN 4000 AND 100000),
  ADD CONSTRAINT "legal_entities_invoice_early_payment_discount_length"
    CHECK ("invoice_early_payment_discount" IS NULL OR char_length("invoice_early_payment_discount") BETWEEN 1 AND 200);
