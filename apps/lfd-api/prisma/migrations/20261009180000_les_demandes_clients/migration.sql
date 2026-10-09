-- LES DEMANDES CLIENTS — motifs par formulaire, demandes (« Nous écrire »,
-- « Signaler un problème »), photos, carte de contact et numéros.
-- Plan `documentation/contenu-ecommerce/demandes-clients.md` (Hugo,
-- 2026-10-09), §6.1 : REMPLACE les quatre migrations du jour
-- (`20261009140000_nous_ecrire` … `20261009170000_le_surtitre_de_la_carte_de_contact`),
-- jamais poussées (vérifié le 2026-10-09 : absentes d'`origin/main` et
-- d'`origin/dev`). Une base qui les a appliquées perd d'abord leurs quatre
-- tables et leurs quatre lignes de `_prisma_migrations` (geste à la main,
-- base de dev seulement), PAS de `migrate reset`.
--
-- ADDITIVE : cinq tables, trois énumérations, une valeur d'énumération.
-- AUCUNE reprise de données. AUCUN DROIT ACCORDÉ : `b2b_contact` est ajoutée
-- à `StaffResource` sans être écrite dans `staff_role_definitions` ni
-- `staff_permission_overrides` ; elle s'accorde à l'écran
-- (`/admin/staff-roles`). Elle n'est employée par aucune instruction de cette
-- migration (une valeur d'enum ne s'emploie pas dans la transaction qui
-- l'ajoute).
--
-- Une demande = une ENVELOPPE (motif figé, auteur, texte, traitement) et les
-- DÉTAILS de son type en colonnes typées : `order_id` / `order_number` pour
-- `order_problem`, interdits pour `contact` (CHECK), et la table des photos.
--
-- Retour arrière : `DROP TABLE` de `customer_request_photo`,
-- `customer_request`, `request_reason`, `contact_phone`, `contact_settings`,
-- puis `DROP TYPE` des trois énumérations — ce qui PERD les demandes reçues :
-- à dire à Hugo avant. La valeur `b2b_contact` ne se retire pas (Postgres).

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_contact' BEFORE 'production_plan';

CREATE TYPE "public"."ContactAudience" AS ENUM ('b2b', 'b2c', 'both');

CREATE TYPE "public"."RequestPriority" AS ENUM ('low', 'medium', 'urgent');

CREATE TYPE "public"."RequestKind" AS ENUM ('contact', 'order_problem');

CREATE TABLE "public"."request_reason" (
    "id" TEXT NOT NULL,
    "kind" "public"."RequestKind" NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_en" TEXT NOT NULL DEFAULT '',
    "label_it" TEXT NOT NULL DEFAULT '',
    "recipient_email" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "audience" "public"."ContactAudience" NOT NULL DEFAULT 'both',
    "priority" "public"."RequestPriority" NOT NULL DEFAULT 'medium',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_reason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."customer_request" (
    "id" TEXT NOT NULL,
    "kind" "public"."RequestKind" NOT NULL,
    "reason_id" TEXT NOT NULL,
    "reason_label" TEXT NOT NULL,
    "priority" "public"."RequestPriority" NOT NULL,
    "audience" "public"."ContactAudience" NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "author_phone" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT,
    "order_id" TEXT,
    "order_number" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "handled_at" TIMESTAMP(3),
    "handled_by_staff_id" TEXT,
    "handled_by_name" TEXT,
    "anonymized_at" TIMESTAMP(3),

    CONSTRAINT "customer_request_pkey" PRIMARY KEY ("id"),
    -- Une demande est écrite depuis UN espace : `both` n'est qu'un public de motif.
    CONSTRAINT "customer_request_audience_single" CHECK ("audience" IN ('b2b', 'b2c')),
    -- Une demande de contact ne cite aucune commande.
    CONSTRAINT "customer_request_contact_without_order" CHECK (
        "kind" <> 'contact' OR ("order_id" IS NULL AND "order_number" IS NULL)
    ),
    -- Un problème de commande cite sa commande — jusqu'à son anonymisation.
    CONSTRAINT "customer_request_order_problem_has_order" CHECK (
        "kind" <> 'order_problem' OR "anonymized_at" IS NOT NULL
        OR ("order_id" IS NOT NULL AND "order_number" IS NOT NULL)
    )
);

CREATE TABLE "public"."customer_request_photo" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "purged_at" TIMESTAMP(3),

    CONSTRAINT "customer_request_photo_pkey" PRIMARY KEY ("id"),
    -- Trois photos au plus, rangs 0..2 (l'agrégat le refuse avant).
    CONSTRAINT "customer_request_photo_position_range" CHECK ("position" BETWEEN 0 AND 2)
);

CREATE TABLE "public"."contact_settings" (
    "key" TEXT NOT NULL,
    "b2b_kicker_fr" TEXT NOT NULL DEFAULT '',
    "b2b_kicker_en" TEXT NOT NULL DEFAULT '',
    "b2b_kicker_it" TEXT NOT NULL DEFAULT '',
    "b2b_title_fr" TEXT NOT NULL DEFAULT '',
    "b2b_title_en" TEXT NOT NULL DEFAULT '',
    "b2b_title_it" TEXT NOT NULL DEFAULT '',
    "b2b_body_fr" TEXT NOT NULL DEFAULT '',
    "b2b_body_en" TEXT NOT NULL DEFAULT '',
    "b2b_body_it" TEXT NOT NULL DEFAULT '',
    "b2c_kicker_fr" TEXT NOT NULL DEFAULT '',
    "b2c_kicker_en" TEXT NOT NULL DEFAULT '',
    "b2c_kicker_it" TEXT NOT NULL DEFAULT '',
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

CREATE TABLE "public"."contact_phone" (
    "id" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_en" TEXT NOT NULL DEFAULT '',
    "label_it" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL,
    "audience" "public"."ContactAudience" NOT NULL DEFAULT 'both',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_phone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "request_reason_kind_archived_at_position_idx" ON "public"."request_reason"("kind", "archived_at", "position");

CREATE INDEX "customer_request_handled_at_priority_received_at_idx" ON "public"."customer_request"("handled_at", "priority", "received_at");

CREATE INDEX "customer_request_kind_handled_at_idx" ON "public"."customer_request"("kind", "handled_at");

CREATE INDEX "customer_request_reason_id_idx" ON "public"."customer_request"("reason_id");

CREATE UNIQUE INDEX "customer_request_photo_request_id_position_key" ON "public"."customer_request_photo"("request_id", "position");

CREATE INDEX "contact_phone_archived_at_position_idx" ON "public"."contact_phone"("archived_at", "position");

ALTER TABLE "public"."customer_request" ADD CONSTRAINT "customer_request_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "public"."request_reason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."customer_request_photo" ADD CONSTRAINT "customer_request_photo_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."customer_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
