-- LES ANNONCES AUX ABONNÉS DE LA VITRINE (Hugo, 2026-10-18)
--
-- Plan `documentation/webhooks/plan-webhook-vitrine.md`, §7 : le staff écrit
-- un e-mail aux contacts des abonnés depuis l'écran du webhook. Le journal en
-- garde l'auteur (id du staff), l'objet, le message, et par destinataire
-- l'adresse à l'envoi et si le fournisseur l'a acceptée.
--
-- ADDITIVE : deux tables neuves, aucune reprise de données. Les bornes sont
-- celles du domaine (`VitrineNotice`). Pas de DELETE : clés étrangères en
-- RESTRICT.
--
-- Retour arrière : `DROP TABLE "public"."vitrine_notice_recipients",
-- "public"."vitrine_notices"` — perd le journal des annonces.

CREATE TABLE "public"."vitrine_notices" (
    "id" TEXT NOT NULL,
    "author_staff_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "vitrine_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vitrine_notices_subject_length" CHECK (char_length("subject") BETWEEN 1 AND 150),
    CONSTRAINT "vitrine_notices_message_length" CHECK (char_length("message") BETWEEN 1 AND 5000)
);

CREATE UNIQUE INDEX "vitrine_notices_idempotency_key_key" ON "public"."vitrine_notices"("idempotency_key");
CREATE INDEX "vitrine_notices_created_at_idx" ON "public"."vitrine_notices"("created_at");

CREATE TABLE "public"."vitrine_notice_recipients" (
    "notice_id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "mail_sent" BOOLEAN,
    "attempted_at" TIMESTAMPTZ(3),
    CONSTRAINT "vitrine_notice_recipients_pkey" PRIMARY KEY ("notice_id", "subscriber_id"),
    CONSTRAINT "vitrine_notice_recipients_attempt" CHECK (("mail_sent" IS NULL) = ("attempted_at" IS NULL))
);

ALTER TABLE "public"."vitrine_notice_recipients"
    ADD CONSTRAINT "vitrine_notice_recipients_notice_id_fkey" FOREIGN KEY ("notice_id")
    REFERENCES "public"."vitrine_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."vitrine_notice_recipients"
    ADD CONSTRAINT "vitrine_notice_recipients_subscriber_id_fkey" FOREIGN KEY ("subscriber_id")
    REFERENCES "public"."vitrine_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
