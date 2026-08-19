-- Le courrier laisse une trace, et les webhooks cessent de compter double.
--
-- `mail_send` : une ligne par e-mail parti. Sans elle, un webhook Resend est
-- muet d'avance — il annonce qu'un message a rebondi en donnant un identifiant
-- fournisseur auquel rien, de notre côté, ne correspond.
CREATE TABLE "ops"."mail_send" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT,
    "template" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "status_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_send_pkey" PRIMARY KEY ("id")
);

-- Unique et NULLABLE : Postgres autorise plusieurs NULL, donc les envois à
-- blanc (aucun identifiant) cohabitent sans se marcher dessus.
CREATE UNIQUE INDEX "mail_send_provider_id_key" ON "ops"."mail_send"("provider_id");

-- La lecture des relevés : par gabarit, sur une fenêtre récente.
CREATE INDEX "mail_send_template_sent_at_idx" ON "ops"."mail_send"("template", "sent_at");

-- `webhook_event` : le registre des messages déjà vus. L'unicité est portée par
-- la BASE et non par une vérification applicative, qui perdrait la course à
-- deux livraisons simultanées du même événement.
CREATE TABLE "ops"."webhook_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_event_provider_external_id_key" ON "ops"."webhook_event"("provider", "external_id");
