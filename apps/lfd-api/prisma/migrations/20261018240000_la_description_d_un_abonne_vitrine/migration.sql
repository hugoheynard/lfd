-- LA DESCRIPTION ET LE CONTACT D'UN ABONNÉ DE LA VITRINE (Hugo, 2026-10-18)
--
-- Plan `documentation/webhooks/plan-webhook-vitrine.md`, §7 : un texte libre,
-- facultatif, pour le staff — à quoi sert cet abonné. Jamais envoyé à
-- l'agence, jamais servi sur `/vitrine/*`. Et une adresse e-mail de contact,
-- facultative, pour les e-mails de mise à jour à l'agence (aucun envoi encore) :
-- elle peut être nominative, elle est au registre RGPD.
--
-- ADDITIVE : deux colonnes nullables, aucune reprise de données. La borne est
-- celle du domaine (`VITRINE_SUBSCRIBER_DESCRIPTION_MAX`).
--
-- Retour arrière : `ALTER TABLE … DROP COLUMN "description"` — perd les
-- descriptions et les contacts saisis.

ALTER TABLE "public"."vitrine_subscribers" ADD COLUMN "description" TEXT;

ALTER TABLE "public"."vitrine_subscribers"
    ADD CONSTRAINT "vitrine_subscribers_description_length"
    CHECK ("description" IS NULL OR char_length("description") BETWEEN 1 AND 500);

-- La forme est vérifiée par le domaine (`EmailAddress`) ; la base retient
-- l'essentiel : une arobase, en minuscules, 254 caractères au plus.
ALTER TABLE "public"."vitrine_subscribers" ADD COLUMN "contact_email" TEXT;

ALTER TABLE "public"."vitrine_subscribers"
    ADD CONSTRAINT "vitrine_subscribers_contact_email_shape"
    CHECK (
        "contact_email" IS NULL
        OR (
            char_length("contact_email") BETWEEN 3 AND 254
            AND position('@' IN "contact_email") > 1
            AND "contact_email" = lower("contact_email")
        )
    );
