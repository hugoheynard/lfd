-- Terme de règlement : distinguer le convenu (staff-only) du souhaité (demande client).
ALTER TABLE "companies" ADD COLUMN "requested_payment_term" "PaymentTerm";

-- Certification du KBIS propre au fichier, découplée de status ; posée par le staff,
-- remise à null à chaque (re)dépôt.
ALTER TABLE "companies" ADD COLUMN "kbis_certified_at" TIMESTAMP(3);
