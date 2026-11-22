-- Plan B : le balayage des paiements en attente
-- (documentation/payment/plan-b-balayage-des-paiements-en-attente.md, §2.2).
--
-- Additive : une colonne NULLABLE, aucune ligne réécrite (NULL pour toutes, ce
-- qui les met une fois en tête de file), et un index partiel que Prisma ne
-- sait pas écrire. Le déclencheur `card_payment_guard` ne protège pas cette
-- colonne : c'est un curseur technique, avancé hors transaction métier.

ALTER TABLE "payment"."card_payment" ADD COLUMN "provider_checked_at" TIMESTAMPTZ(6);

CREATE INDEX "card_payment_provider_check_idx"
  ON "payment"."card_payment" ("provider_checked_at" ASC NULLS FIRST, "created_at")
  WHERE "state" IN ('pending', 'failed');
