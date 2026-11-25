-- Le bloc des événements : son schéma `events`, l'événement et ses fiches de
-- fonction (documentation/evenements/plan-evenements.md, lot E0).
--
-- ADDITIVE : un schéma neuf et deux tables vides, une valeur d'enum de plus.
-- Aucune clé étrangère ne sort de `events` : l'auteur d'un geste s'y désigne
-- par l'identifiant du staff. Pas de DELETE : l'événement et la fiche
-- s'archivent (`archived_at`).

CREATE SCHEMA IF NOT EXISTS "events";

-- ─── L'événement ────────────────────────────────────────────────────────────
CREATE TABLE "events"."event" (
  "id"           TEXT PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "event_date"   DATE NOT NULL,
  "applications" TEXT[] NOT NULL,
  "archived_at"  TIMESTAMPTZ(6),
  "created_by"   TEXT NOT NULL,
  "created_at"   TIMESTAMPTZ(6) NOT NULL,
  "updated_at"   TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "event_name_not_blank" CHECK (btrim("name") <> ''),
  -- Non vide, et chaque valeur connue. `cardinality` et non `array_length` :
  -- ce dernier rend NULL sur un tableau vide, et un CHECK NULL passe.
  CONSTRAINT "event_applications_not_empty" CHECK (cardinality("applications") > 0),
  CONSTRAINT "event_applications_known"
    CHECK ("applications" <@ ARRAY['lafoliecoffee']::TEXT[]
      AND array_position("applications", NULL) IS NULL)
);
CREATE INDEX "event_event_date_idx" ON "events"."event" ("event_date");

-- ─── Ses fiches de fonction ─────────────────────────────────────────────────
CREATE TABLE "events"."function_sheet" (
  "id"           TEXT PRIMARY KEY,
  "event_id"     TEXT NOT NULL,
  "file_name"    TEXT NOT NULL,
  "storage_key"  TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "size_bytes"   INTEGER NOT NULL,
  "position"     INTEGER NOT NULL,
  "uploaded_by"  TEXT NOT NULL,
  "uploaded_at"  TIMESTAMPTZ(6) NOT NULL,
  "archived_at"  TIMESTAMPTZ(6),
  CONSTRAINT "function_sheet_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"."event" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "function_sheet_pdf_only" CHECK ("content_type" = 'application/pdf'),
  CONSTRAINT "function_sheet_size_positive" CHECK ("size_bytes" > 0),
  CONSTRAINT "function_sheet_position_not_negative" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "function_sheet_event_id_position_key"
  ON "events"."function_sheet" ("event_id", "position");

-- ─── Le droit ───────────────────────────────────────────────────────────────
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien n'est
-- écrit dans `staff_role_definitions` ni `staff_permission_overrides`. Geste
-- de mise en service : l'admin accorde `events` à l'écran (`/admin/staff-roles`).
-- La valeur n'est employée par rien dans cette migration : l'ajouter dans la
-- même transaction est donc sans risque.
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place.
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'events' AFTER 'exports';
