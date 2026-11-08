-- LE REGISTRE DE PRÉFÉRENCE MARKETING — plan
-- `documentation/mail/plan-desinscription-des-e-mails.md`, lot U2 (règles 10,
-- 20, 22, 23 et la contradiction de vitruve).
--
-- ADDITIVE : une table neuve dans le schéma `mail`, une colonne NULLABLE sur
-- `mail_request`. Aucune colonne supprimée, renommée ni resserrée ; aucun
-- droit accordé à aucun rôle.
--
-- - `mail_marketing_preference` : l'accord et le retrait d'une adresse, par
--   espace. Pas de ligne = jamais demandé. `print` est l'empreinte HMAC à clé
--   de l'adresse (64 hexadécimaux), qui survit à l'effacement : une ligne
--   `unsubscribed` effacée perd `recipient_key` et garde `print`.
-- - Unicité `(space, recipient_key)` : Postgres tient deux NULL pour
--   distincts, elle ne vaut donc que tant que la clé existe. Unicité
--   `(space, print)` : une seule ligne par personne et par espace, effacée
--   ou non. Index sur `print` : « ne plus rien recevoir du groupe ».
-- - Les contraintes de ligne : une clé effacée n'existe que sur une
--   désinscription ; une désinscription porte son instant et sa source ; un
--   accord porte son instant de confirmation.
-- - `mail_request.refusal_code` : la raison fermée d'un refus
--   (`unsubscribed` | `no_consent`), lue par le suivi.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE
-- "mail"."mail_marketing_preference"` et `ALTER TABLE "mail"."mail_request"
-- DROP COLUMN "refusal_code"`. Le code d'avant ne les lit pas.

-- AlterTable
ALTER TABLE "mail"."mail_request"
    ADD COLUMN "refusal_code" VARCHAR(16),
    ADD CONSTRAINT "mail_request_refusal_code_check"
        CHECK ("refusal_code" IN ('unsubscribed', 'no_consent'));

-- CreateTable
CREATE TABLE "mail"."mail_marketing_preference" (
    "id" TEXT NOT NULL,
    "space" VARCHAR(16) NOT NULL,
    "recipient_key" VARCHAR(320),
    "print" VARCHAR(64) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "origin" VARCHAR(8),
    "accepted_text_version" VARCHAR(64),
    "accepted_locale" VARCHAR(8),
    "accepted_where" VARCHAR(12),
    "accepted_ref" VARCHAR(120),
    "requested_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "unsubscribed_at" TIMESTAMPTZ(6),
    "unsubscribed_source" VARCHAR(10),

    CONSTRAINT "mail_marketing_preference_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mail_marketing_preference_space_check"
        CHECK ("space" IN ('lfc', 'lfd')),
    CONSTRAINT "mail_marketing_preference_print_check"
        CHECK ("print" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "mail_marketing_preference_recipient_key_check"
        CHECK ("recipient_key" = lower("recipient_key")),
    CONSTRAINT "mail_marketing_preference_status_check"
        CHECK ("status" IN ('pending', 'accepted', 'unsubscribed')),
    CONSTRAINT "mail_marketing_preference_origin_check"
        CHECK ("origin" IN ('direct', 'partners')),
    CONSTRAINT "mail_marketing_preference_accepted_where_check"
        CHECK ("accepted_where" IN ('signup', 'preferences', 'order', 'newsletter', 'staff')),
    CONSTRAINT "mail_marketing_preference_unsubscribed_source_check"
        CHECK ("unsubscribed_source" IN ('link', 'one_click', 'staff', 'group')),
    CONSTRAINT "mail_marketing_preference_erased_check"
        CHECK ("recipient_key" IS NOT NULL OR "status" = 'unsubscribed'),
    CONSTRAINT "mail_marketing_preference_unsubscribed_check"
        CHECK ("status" <> 'unsubscribed'
            OR ("unsubscribed_at" IS NOT NULL AND "unsubscribed_source" IS NOT NULL)),
    CONSTRAINT "mail_marketing_preference_accepted_check"
        CHECK ("status" <> 'accepted' OR "confirmed_at" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_marketing_preference_space_recipient_key_key" ON "mail"."mail_marketing_preference"("space", "recipient_key");

-- CreateIndex
CREATE UNIQUE INDEX "mail_marketing_preference_space_print_key" ON "mail"."mail_marketing_preference"("space", "print");

-- CreateIndex
CREATE INDEX "mail_marketing_preference_print_idx" ON "mail"."mail_marketing_preference"("print");
