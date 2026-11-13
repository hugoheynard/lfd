-- L'ÉCHÉANCE DES FACTURES AU VIREMENT devient un réglage de l'entité
-- (documentation/comptabilite/le-paiement-par-virement.md, V6).
--
-- ADDITIVE : une colonne, 15 jours après l'émission pour toutes les entités
-- (défaut décidé par Hugo le 2026-11-13). Les bornes 1..45 sont tenues par
-- l'agrégat (`LegalEntity.setTransferDueDays`). Aucune facture n'est touchée :
-- chacune a figé son `due_on` à l'émission.
--
-- Retour arrière : `prisma/rollback/20261113120000_l_echeance_du_virement.sql`.
SET lock_timeout = '5s';

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "transfer_due_days_after_issue" INTEGER NOT NULL DEFAULT 15;
