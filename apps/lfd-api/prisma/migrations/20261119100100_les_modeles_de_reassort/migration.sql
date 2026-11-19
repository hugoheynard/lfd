-- Les modèles de réassort d'un point (plan
-- documentation/reassort-boutiques/plan-modeles-de-reassort.md, lot T1).
--
-- ADDITIVE : une table neuve, ses CHECK et deux index. Rien n'est écrit dans
-- une table existante, aucun droit n'est accordé. Un modèle n'est jamais
-- supprimé : il s'archive (`archived_at`), et son nom redevient libre.

SET lock_timeout = '5s';

CREATE TABLE "public"."resupply_templates" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "target" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_by_role" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "archived_by_staff_id" TEXT,
    "archived_by_name" TEXT,
    "archived_by_role" TEXT,

    CONSTRAINT "resupply_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resupply_templates_site_id_idx"
  ON "public"."resupply_templates"("site_id");

-- Un nom une fois parmi les modèles ACTIFS d'un point, sans égard à la casse :
-- un modèle archivé libère le sien (M7).
CREATE UNIQUE INDEX "resupply_templates_site_active_name_key"
  ON "public"."resupply_templates"("site_id", lower("name"))
  WHERE "archived_at" IS NULL;

ALTER TABLE "public"."resupply_templates"
  ADD CONSTRAINT "resupply_template_target_known" CHECK (
    "target" IN ('tomorrow', 'asap')
  ),
  ADD CONSTRAINT "resupply_template_name_trimmed" CHECK (
    char_length("name") BETWEEN 1 AND 60 AND "name" = btrim("name")
  ),
  ADD CONSTRAINT "resupply_template_lines_array" CHECK (
    jsonb_typeof("lines") = 'array'
  ),
  -- Archivé : la trace entière, ou rien.
  ADD CONSTRAINT "resupply_template_archived_whole" CHECK (
    ("archived_at" IS NULL) = ("archived_by_staff_id" IS NULL)
    AND ("archived_at" IS NULL) = ("archived_by_name" IS NULL)
    AND ("archived_at" IS NULL) = ("archived_by_role" IS NULL)
  );
