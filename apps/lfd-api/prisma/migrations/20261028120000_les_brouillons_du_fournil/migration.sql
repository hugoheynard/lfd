-- Les brouillons du réassort du fournil (plan
-- documentation/reassort-boutiques/plan-brouillons-du-fournil.md, Hugo
-- 2026-10-28 : « enregistrer comme brouillon »).
--
-- ADDITIVE : une table neuve, ses CHECK et un index. Rien n'est écrit dans
-- une table existante : `site_resupply` ne change pas — son CHECK
-- `site_resupply_bakehouse_placed` et son index de la demande en cours
-- restent ce que le comptoir lit. Aucun droit n'est accordé.

SET lock_timeout = '5s';

CREATE TABLE "public"."bakehouse_resupply_drafts" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "name" VARCHAR(60),
    "lines" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sent_resupply_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_by_role" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_staff_id" TEXT,
    "closed_by_name" TEXT,
    "closed_by_role" TEXT,

    CONSTRAINT "bakehouse_resupply_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bakehouse_resupply_drafts_status_updated_at_idx"
  ON "public"."bakehouse_resupply_drafts"("status", "updated_at");

ALTER TABLE "public"."bakehouse_resupply_drafts"
  ADD CONSTRAINT "bakehouse_resupply_draft_status_known" CHECK (
    "status" IN ('open', 'sent', 'discarded')
  ),
  ADD CONSTRAINT "bakehouse_resupply_draft_target_known" CHECK (
    "target" IN ('tomorrow', 'asap')
  ),
  -- Le réassort né de l'envoi : présent si et seulement si envoyé.
  ADD CONSTRAINT "bakehouse_resupply_draft_sent_resupply" CHECK (
    ("status" = 'sent') = ("sent_resupply_id" IS NOT NULL)
  ),
  -- Clos (envoyé ou supprimé) si et seulement si la trace de clôture existe.
  ADD CONSTRAINT "bakehouse_resupply_draft_closed_whole" CHECK (
    ("status" = 'open') = ("closed_at" IS NULL)
  ),
  ADD CONSTRAINT "bakehouse_resupply_draft_name_trimmed" CHECK (
    "name" IS NULL OR (char_length("name") BETWEEN 1 AND 60 AND "name" = btrim("name"))
  ),
  ADD CONSTRAINT "bakehouse_resupply_draft_lines_array" CHECK (
    jsonb_typeof("lines") = 'array'
  );
