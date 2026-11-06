-- L'ENVOI SORT DE LA TRANSACTION DE LIVRAISON — plan
-- `documentation/editeur-de-contenu/plan-service-e-mails.md`, lot S1b (§ 8).
--
-- ADDITIVE : trois colonnes neuves sur `mail.mail_request` (nullables, ou
-- avec un défaut), un index, et le CHECK d'état ÉLARGI à `sending`. Aucune
-- valeur existante n'est refusée par le nouveau CHECK ; aucune donnée copiée,
-- aucun droit accordé à un rôle.
--
-- Retour arrière (migration EN AVANT) : remettre le CHECK sans `sending` après
-- avoir passé les lignes `sending` en `failed`, puis supprimer l'index et les
-- trois colonnes. Gratuit tant que S2 n'a branché aucun envoyeur.

-- AlterTable
ALTER TABLE "mail"."mail_request"
    ADD COLUMN "first_attempt_at" TIMESTAMPTZ(6),
    ADD COLUMN "last_attempt_at" TIMESTAMPTZ(6),
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Le CHECK suit les valeurs que l'agrégat `MailRequest` connaît.
ALTER TABLE "mail"."mail_request" DROP CONSTRAINT "mail_request_status_check";
ALTER TABLE "mail"."mail_request" ADD CONSTRAINT "mail_request_status_check"
    CHECK ("status" IN ('requested', 'sending', 'sent', 'failed', 'refused'));

ALTER TABLE "mail"."mail_request" ADD CONSTRAINT "mail_request_attempts_check"
    CHECK ("attempts" >= 0);

-- CreateIndex — le balayeur lit par état et par dernière tentative.
CREATE INDEX "mail_request_status_last_attempt_at_idx" ON "mail"."mail_request"("status", "last_attempt_at");
