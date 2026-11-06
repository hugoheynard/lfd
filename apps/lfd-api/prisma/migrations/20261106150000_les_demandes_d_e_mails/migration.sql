-- LES DEMANDES D'E-MAILS ET LEUR SUIVI — plan
-- `documentation/editeur-de-contenu/plan-service-e-mails.md`, lot S1 (C2, C7).
--
-- ADDITIVE : une table neuve dans le schéma `mail` (vide depuis S0). Aucune
-- table existante touchée, aucune donnée copiée, aucun droit accordé à un rôle.
-- Rien ne l'écrit en production tant qu'aucun envoyeur ne passe par la porte
-- `MailRequests` (lot S2).
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE "mail"."mail_request"`.
-- Gratuit tant que S2 n'est pas déployé.
--
-- ⚠️ `recipient` est une donnée personnelle ; sa durée de conservation n'est
-- pas décidée (plan C7).

-- CreateTable
CREATE TABLE "mail"."mail_request" (
    "id" TEXT NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "brand" VARCHAR(16) NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "locale" VARCHAR(8),
    "status" VARCHAR(10) NOT NULL,
    "provider_id" TEXT,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "failure_reason" VARCHAR(500),
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),

    CONSTRAINT "mail_request_pkey" PRIMARY KEY ("id"),
    -- Les valeurs que l'agrégat `MailRequest` connaît ; une valeur neuve
    -- passe par une migration, pas par une écriture.
    CONSTRAINT "mail_request_status_check"
      CHECK ("status" IN ('requested', 'sent', 'failed', 'refused')),
    CONSTRAINT "mail_request_brand_check" CHECK ("brand" IN ('lfc'))
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_request_idempotency_key_key" ON "mail"."mail_request"("idempotency_key");

-- CreateIndex
CREATE INDEX "mail_request_status_requested_at_idx" ON "mail"."mail_request"("status", "requested_at");
