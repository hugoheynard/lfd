-- LE SUIVI DES RETOURS D'E-MAILS — plan
-- `documentation/mail/plan-suivi-des-e-mails.md`, lot T1 (décisions 1 à 4, 9).
--
-- ADDITIVE : une table neuve dans le schéma `mail`, quatre colonnes NULLABLES
-- sur `mail_request`, trois index ordinaires. Aucune colonne supprimée,
-- renommée ni resserrée ; aucun droit accordé à aucun rôle.
--
-- - `mail_delivery_event` : chaque retour de Resend (remis, retardé, rebondi,
--   signalé) est RANGÉ ici avant d'être appliqué — un rebond peut précéder la
--   pose du `provider_id` sur la demande. `svix_id` unique : un rejeu de Svix
--   ne range pas deux fois. Le genre du retour seulement (`Permanent`,
--   `Permanent/Suppressed`), jamais le texte du fournisseur, qui cite
--   l'adresse : la contrainte de forme n'admet que des lettres.
-- - `mail_request.delivery`, `delivery_at`, `delivery_kind` : le retour
--   appliqué, relevé vers le haut seulement (décision 3). `null` = rien reçu.
-- - `mail_request.recipient_key` : l'adresse en minuscules (décision 9),
--   remplie ici pour les demandes déjà en base. Nullable : un binaire d'avant
--   ce lot, encore en service le temps du déploiement, n'en écrit pas.
-- - Index NON unique sur `provider_id` (décision 3) : l'absence de doublons
--   en production n'a pas été vérifiée.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE
-- "mail"."mail_delivery_event"` et `ALTER TABLE "mail"."mail_request" DROP
-- COLUMN` des quatre colonnes (avec leurs index et contraintes). Le code
-- d'avant ne les lit pas ; `ops.mail_send` reste écrite par ce lot.

-- AlterTable
ALTER TABLE "mail"."mail_request"
    ADD COLUMN "recipient_key" VARCHAR(320),
    ADD COLUMN "delivery" VARCHAR(12),
    ADD COLUMN "delivery_at" TIMESTAMPTZ(6),
    ADD COLUMN "delivery_kind" VARCHAR(64),
    ADD CONSTRAINT "mail_request_delivery_check"
        CHECK ("delivery" IN ('delayed', 'delivered', 'complained', 'bounced')),
    ADD CONSTRAINT "mail_request_delivery_kind_check"
        CHECK ("delivery_kind" ~ '^[A-Za-z]{1,30}(/[A-Za-z]{1,30})?$');

-- Remplissage : la même règle que l'agrégat (`recipientKeyOf`).
UPDATE "mail"."mail_request" SET "recipient_key" = lower("recipient");

-- CreateTable
CREATE TABLE "mail"."mail_delivery_event" (
    "id" TEXT NOT NULL,
    "svix_id" VARCHAR(200) NOT NULL,
    "provider_id" TEXT NOT NULL,
    "delivery" VARCHAR(12) NOT NULL,
    "kind" VARCHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_delivery_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mail_delivery_event_delivery_check"
        CHECK ("delivery" IN ('delayed', 'delivered', 'complained', 'bounced')),
    CONSTRAINT "mail_delivery_event_kind_check"
        CHECK ("kind" ~ '^[A-Za-z]{1,30}(/[A-Za-z]{1,30})?$')
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_delivery_event_svix_id_key" ON "mail"."mail_delivery_event"("svix_id");

-- CreateIndex
CREATE INDEX "mail_delivery_event_provider_id_idx" ON "mail"."mail_delivery_event"("provider_id");

-- CreateIndex
CREATE INDEX "mail_delivery_event_received_at_idx" ON "mail"."mail_delivery_event"("received_at");

-- CreateIndex
CREATE INDEX "mail_request_provider_id_idx" ON "mail"."mail_request"("provider_id");

-- CreateIndex
CREATE INDEX "mail_request_recipient_key_idx" ON "mail"."mail_request"("recipient_key");

-- CreateIndex
CREATE INDEX "mail_request_delivery_delivery_at_idx" ON "mail"."mail_request"("delivery", "delivery_at");
