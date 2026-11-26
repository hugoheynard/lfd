-- LE RÉCAPITULATIF DES BL D'UN RESTAURANT MAISON — quatre tables neuves
-- (documentation/comptabilite/facturation/plan-restaurants-maison.md, D7–D9,
-- lot L3).
--
-- ADDITIVE : quatre tables neuves, vides. Aucune colonne existante touchée ;
-- les binaires en place ne les lisent pas.
--
-- - `in_house_recap` : le document figé d'un (payeur, mois), sans montant ;
--   un rectificatif le remplace (`replaced_by_id`), l'ancien reste.
-- - `in_house_recap_line` : quantité totale par (sku, unité de vente).
-- - `in_house_recap_note` : les BL couverts, version de contenu figée. Un BL
--   n'est couvert que par UN récapitulatif non remplacé (index unique
--   partiel sur `replaced_at IS NULL`).
-- - `in_house_recap_run` : l'issue du passage mensuel, une par (payeur, mois) ;
--   `recap_id` nul pour un mois vide. Sans clé étrangère vers le
--   récapitulatif : l'issue s'écrit avant lui, dans la même transaction.
--
-- Retour arrière : `prisma/rollback/20261126180000_le_recapitulatif_des_bl_maison.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."in_house_recap" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "period_from" TIMESTAMPTZ(3) NOT NULL,
    "period_to" TIMESTAMPTZ(3) NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "storage_key" TEXT,
    "replaced_by_id" TEXT,

    CONSTRAINT "in_house_recap_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "in_house_recap_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "in_house_recap_period_ordered" CHECK ("period_from" < "period_to"),
    CONSTRAINT "in_house_recap_not_self_replaced" CHECK ("replaced_by_id" <> "id")
);

CREATE UNIQUE INDEX "in_house_recap_number_key" ON "public"."in_house_recap"("number");
CREATE UNIQUE INDEX "in_house_recap_replaced_by_id_key" ON "public"."in_house_recap"("replaced_by_id");
CREATE INDEX "in_house_recap_payer_id_month_idx" ON "public"."in_house_recap"("payer_id", "month");

CREATE TABLE "public"."in_house_recap_line" (
    "id" TEXT NOT NULL,
    "recap_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sale_unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "in_house_recap_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "in_house_recap_line_quantity_positive" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "in_house_recap_line_recap_id_position_key" ON "public"."in_house_recap_line"("recap_id", "position");

CREATE TABLE "public"."in_house_recap_note" (
    "id" TEXT NOT NULL,
    "recap_id" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "handed_over_at" TIMESTAMPTZ(3) NOT NULL,
    "content_version" INTEGER NOT NULL,
    "replaced_at" TIMESTAMPTZ(3),

    CONSTRAINT "in_house_recap_note_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "in_house_recap_note_recap_id_idx" ON "public"."in_house_recap_note"("recap_id");
CREATE INDEX "in_house_recap_note_delivery_note_id_idx" ON "public"."in_house_recap_note"("delivery_note_id");

-- Un BL n'est que dans UN récapitulatif non remplacé : deux passages
-- concurrents, ou un rectificatif qui oublierait de libérer l'ancien, ne
-- tiennent pas tous les deux.
CREATE UNIQUE INDEX "in_house_recap_note_covered_once"
    ON "public"."in_house_recap_note"("delivery_note_id") WHERE "replaced_at" IS NULL;

CREATE TABLE "public"."in_house_recap_run" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "recap_id" TEXT,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "in_house_recap_run_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "in_house_recap_run_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX "in_house_recap_run_payer_id_month_key" ON "public"."in_house_recap_run"("payer_id", "month");

ALTER TABLE "public"."in_house_recap"
  ADD CONSTRAINT "in_house_recap_payer_id_fkey"
  FOREIGN KEY ("payer_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."in_house_recap"
  ADD CONSTRAINT "in_house_recap_replaced_by_id_fkey"
  FOREIGN KEY ("replaced_by_id") REFERENCES "public"."in_house_recap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."in_house_recap_line"
  ADD CONSTRAINT "in_house_recap_line_recap_id_fkey"
  FOREIGN KEY ("recap_id") REFERENCES "public"."in_house_recap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."in_house_recap_note"
  ADD CONSTRAINT "in_house_recap_note_recap_id_fkey"
  FOREIGN KEY ("recap_id") REFERENCES "public"."in_house_recap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."in_house_recap_note"
  ADD CONSTRAINT "in_house_recap_note_delivery_note_id_fkey"
  FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."in_house_recap_run"
  ADD CONSTRAINT "in_house_recap_run_payer_id_fkey"
  FOREIGN KEY ("payer_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
