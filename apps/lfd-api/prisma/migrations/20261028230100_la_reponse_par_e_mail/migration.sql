-- LA RÉPONSE PAR E-MAIL — ses colonnes et son motif (plan
-- `documentation/demandes-client/plan-reponses-par-e-mail.md`, R1, 2026-10-28).
--
-- ADDITIVE : quatre colonnes nullables sur `customer_request`, des CHECK qui
-- ne visent que le type neuf (aucune ligne existante n'en est), un index
-- unique, un index de lecture, et UNE ligne de référence dans
-- `request_reason`. Aucune donnée existante n'est touchée.
--
-- · `email_message_id` : l'identifiant Resend du message reçu, UNIQUE — la
--   réception est un insérer-ou-ignorer sur lui, et c'est ce qui rend un
--   rejeu de Resend sans effet. Il reste après l'anonymisation ;
-- · `email_subject`, `email_attachments` (nom, type, taille — jamais le
--   contenu) : vidés à l'anonymisation ;
-- · `email_authentication` : le verdict SPF / DKIM / DMARC de l'expéditeur.
--
-- Le motif système « Réponse à un e-mail » a un identifiant FIXE
-- (`system_email_reply`), que la réception cite : une donnée de référence,
-- pas un droit. Le domaine refuse de le réviser ou de l'archiver à l'écran.
-- Son adresse n'envoie rien : aucune réponse n'est relayée par courriel.
--
-- RETOUR ARRIÈRE :
--   DROP INDEX "public"."customer_request_email_message_id_key";
--   DROP INDEX "public"."customer_request_kind_author_email_received_at_idx";
--   ALTER TABLE "public"."customer_request"
--     DROP CONSTRAINT "customer_request_email_columns_only_on_email_reply",
--     DROP CONSTRAINT "customer_request_email_reply_shape",
--     DROP COLUMN "email_message_id", DROP COLUMN "email_subject",
--     DROP COLUMN "email_attachments", DROP COLUMN "email_authentication";
--   (le motif reste : une demande rangée le cite, la clé étrangère le retient.)

SET lock_timeout = '5s';

ALTER TABLE "public"."customer_request"
    ADD COLUMN "email_message_id" TEXT,
    ADD COLUMN "email_subject" TEXT,
    ADD COLUMN "email_attachments" JSONB,
    ADD COLUMN "email_authentication" JSONB;

ALTER TABLE "public"."customer_request"
    -- Les colonnes de la réponse par e-mail n'appartiennent qu'à elle.
    ADD CONSTRAINT "customer_request_email_columns_only_on_email_reply" CHECK (
        "kind" = 'email_reply' OR (
            "email_message_id" IS NULL AND "email_subject" IS NULL
            AND "email_attachments" IS NULL AND "email_authentication" IS NULL
        )
    ),
    -- Une réponse par e-mail porte toujours son identifiant, son objet (vide
    -- après anonymisation), sa liste de pièces jointes et son verdict.
    ADD CONSTRAINT "customer_request_email_reply_shape" CHECK (
        "kind" <> 'email_reply' OR (
            "email_message_id" IS NOT NULL AND "email_subject" IS NOT NULL
            AND "email_attachments" IS NOT NULL
            AND jsonb_typeof("email_attachments") = 'array'
            AND "email_authentication" IS NOT NULL
        )
    );

CREATE UNIQUE INDEX "customer_request_email_message_id_key"
    ON "public"."customer_request" ("email_message_id");

-- Le plafond de réception (10 par heure et par adresse) et la cloche bornée
-- comptent les réponses récentes d'une adresse.
CREATE INDEX "customer_request_kind_author_email_received_at_idx"
    ON "public"."customer_request" ("kind", "author_email", "received_at");

INSERT INTO "public"."request_reason" (
    "id", "kind", "label_fr", "label_en", "label_it", "recipient_email",
    "position", "active", "audience", "priority", "archived_at", "created_at", "updated_at"
) VALUES (
    'system_email_reply', 'email_reply', 'Réponse à un e-mail', 'Reply to an e-mail',
    'Risposta a un''e-mail', 'reponses@reponses.lafoliecoffee.info',
    0, true, 'both', 'medium', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
