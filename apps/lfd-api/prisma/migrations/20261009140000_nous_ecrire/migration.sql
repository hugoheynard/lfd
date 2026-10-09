-- « NOUS ÉCRIRE » — les objets de contact, la carte de contact, les messages.
-- Plan `documentation/order/plan-nous-ecrire.md` (Hugo, 2026-10-09).
--
-- ADDITIVE : trois tables neuves, une énumération neuve, une valeur
-- d'énumération neuve. Aucune ligne existante réécrite, aucune colonne
-- resserrée.
--
-- 🔴 AUCUN DROIT ACCORDÉ : `b2b_contact` est ajoutée à `StaffResource` sans
-- être écrite dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Après déploiement, elle s'accorde à l'écran (`/admin/staff-roles`) — cf.
-- `documentation/ops/runbook.md`. Elle n'est employée par aucune instruction
-- de cette migration (une valeur d'enum ne s'emploie pas dans la transaction
-- qui l'ajoute).
--
-- `contact_settings` est à ligne unique (clé `contact`), qu'aucune ligne ne
-- remplit : absente, la boutique garde les textes de son dictionnaire.
--
-- Retour arrière : `DROP TABLE` de `contact_message`, `contact_subject`,
-- `contact_settings`, puis `DROP TYPE "public"."ContactAudience"` — ce qui
-- PERD les messages reçus : à dire à Hugo avant. La valeur `b2b_contact` ne
-- se retire pas (Postgres) : elle reste, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_contact' BEFORE 'production_plan';

CREATE TYPE "public"."ContactAudience" AS ENUM ('b2b', 'b2c', 'both');

CREATE TABLE "public"."contact_subject" (
    "id" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_en" TEXT NOT NULL DEFAULT '',
    "label_it" TEXT NOT NULL DEFAULT '',
    "recipient_email" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "audience" "public"."ContactAudience" NOT NULL DEFAULT 'both',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."contact_message" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "subject_label" TEXT NOT NULL,
    "audience" "public"."ContactAudience" NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "author_phone" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "handled_at" TIMESTAMP(3),
    "handled_by_staff_id" TEXT,
    "handled_by_name" TEXT,
    "anonymized_at" TIMESTAMP(3),

    CONSTRAINT "contact_message_pkey" PRIMARY KEY ("id"),
    -- Un message est écrit depuis UN espace : `both` n'est qu'un public d'objet.
    CONSTRAINT "contact_message_audience_single" CHECK ("audience" IN ('b2b', 'b2c'))
);

CREATE TABLE "public"."contact_settings" (
    "key" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "b2b_title_fr" TEXT NOT NULL DEFAULT '',
    "b2b_title_en" TEXT NOT NULL DEFAULT '',
    "b2b_title_it" TEXT NOT NULL DEFAULT '',
    "b2b_body_fr" TEXT NOT NULL DEFAULT '',
    "b2b_body_en" TEXT NOT NULL DEFAULT '',
    "b2b_body_it" TEXT NOT NULL DEFAULT '',
    "b2c_title_fr" TEXT NOT NULL DEFAULT '',
    "b2c_title_en" TEXT NOT NULL DEFAULT '',
    "b2c_title_it" TEXT NOT NULL DEFAULT '',
    "b2c_body_fr" TEXT NOT NULL DEFAULT '',
    "b2c_body_en" TEXT NOT NULL DEFAULT '',
    "b2c_body_it" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,

    CONSTRAINT "contact_settings_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "contact_subject_archived_at_position_idx" ON "public"."contact_subject"("archived_at", "position");

CREATE INDEX "contact_message_handled_at_received_at_idx" ON "public"."contact_message"("handled_at", "received_at");

CREATE INDEX "contact_message_subject_id_idx" ON "public"."contact_message"("subject_id");

ALTER TABLE "public"."contact_message" ADD CONSTRAINT "contact_message_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."contact_subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
