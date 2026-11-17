-- LES NIVEAUX DE SUIVI DU FOURNIL — `documentation/fournil/plan-niveaux-de-suivi.md`,
-- § 3.1 à § 3.3, lot N1 (décisions de Hugo du 2026-11-17).
--
-- Le fournil a trois niveaux de suivi (toujours vert, simple, détaillé) : un
-- pour la maison, que chaque poste peut remplacer. Le niveau d'une journée
-- est figé à son premier passage après l'arrêt. Un rouge (« Problème ») pose
-- un plafond par journée et SKU, et la part de fournée qu'il corrige se range
-- sur la fournée (`corrected_quantity`).
--
-- Aucun droit accordé ici.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "production"."production_problem";
--   DROP TABLE "production"."production_day_tracking_level";
--   DROP TABLE "production"."production_tracking_settings";
--   ALTER TABLE "production"."production_workstation"
--     DROP CONSTRAINT "production_workstation_tracking_level",
--     DROP COLUMN "tracking_level";
--   ALTER TABLE "production"."production_batch"
--     DROP CONSTRAINT "production_batch_corrected_quantity",
--     DROP COLUMN "corrected_quantity";

SET lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE RÉGLAGE DU FOURNIL — une ligne, clé `house`
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "production"."production_tracking_settings" (
    "key" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'always_green',
    "margin_minutes" INTEGER NOT NULL DEFAULT 15,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT,

    CONSTRAINT "production_tracking_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "production_tracking_settings_key" CHECK ("key" = 'house'),
    CONSTRAINT "production_tracking_settings_level"
        CHECK ("level" IN ('always_green', 'simple', 'detailed')),
    CONSTRAINT "production_tracking_settings_margin"
        CHECK ("margin_minutes" BETWEEN 0 AND 240)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LE NIVEAU D'UN POSTE — `null` : il suit le fournil
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "production"."production_workstation"
    ADD COLUMN "tracking_level" TEXT,
    ADD CONSTRAINT "production_workstation_tracking_level"
        CHECK ("tracking_level" IN ('always_green', 'simple', 'detailed'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE NIVEAU FIGÉ D'UNE JOURNÉE — une ligne par journée, jamais réécrite
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "production"."production_day_tracking_level" (
    "service_day" VARCHAR(10) NOT NULL,
    "house_level" TEXT NOT NULL,
    "workstation_levels" JSONB NOT NULL,
    "frozen_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_day_tracking_level_pkey" PRIMARY KEY ("service_day"),
    CONSTRAINT "production_day_tracking_level_house_level"
        CHECK ("house_level" IN ('always_green', 'simple', 'detailed')),
    CONSTRAINT "production_day_tracking_level_workstation_levels"
        CHECK (jsonb_typeof("workstation_levels") = 'object'),
    CONSTRAINT "production_day_tracking_level_service_day_fkey"
        FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LES PROBLÈMES — un par journée et SKU
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "production"."production_problem" (
    "id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "sku" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "produced" INTEGER NOT NULL,
    "reason" TEXT,
    "reported_at" TIMESTAMPTZ(6) NOT NULL,
    "reported_by_staff_id" TEXT NOT NULL,
    "reported_by_name" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_staff_id" TEXT,
    "resolved_by_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "production_problem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_problem_expected" CHECK ("expected" >= 0),
    CONSTRAINT "production_problem_produced" CHECK ("produced" >= 0),
    CONSTRAINT "production_problem_reason" CHECK (
        "reason" IS NULL OR ("reason" = btrim("reason") AND char_length("reason") BETWEEN 1 AND 500)
    ),
    CONSTRAINT "production_problem_version" CHECK ("version" >= 1),
    CONSTRAINT "production_problem_resolved" CHECK (
        ("resolved_at" IS NULL) = ("resolved_by_staff_id" IS NULL)
    ),
    CONSTRAINT "production_problem_service_day_fkey"
        FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "production_problem_service_day_sku_key"
    ON "production"."production_problem"("service_day", "sku");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LA PART CORRIGÉE D'UNE FOURNÉE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `DEFAULT 0` + `NOT NULL` ne réécrit pas la table (PostgreSQL ≥ 11) ; le
-- CHECK la lit une fois, et toutes les lignes existantes valent 0.
ALTER TABLE "production"."production_batch"
    ADD COLUMN "corrected_quantity" INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT "production_batch_corrected_quantity"
        CHECK ("corrected_quantity" >= 0 AND "corrected_quantity" <= "quantity");

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. LE JOURNAL DE JOURNÉE — le niveau figé et le problème font relire la fiche
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La fonction existe déjà (`20260928140000_la_version_par_journee`) : les deux
-- tables portent leur colonne `service_day`, comme `production_batch`
-- (`20260928160000_les_fournees`).
CREATE TRIGGER "production_problem_day_change_insert"
  AFTER INSERT ON "production"."production_problem"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_problem_day_change_update"
  AFTER UPDATE ON "production"."production_problem"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_problem_day_change_delete"
  AFTER DELETE ON "production"."production_problem"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "production_day_tracking_level_day_change_insert"
  AFTER INSERT ON "production"."production_day_tracking_level"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_day_tracking_level_day_change_update"
  AFTER UPDATE ON "production"."production_day_tracking_level"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_day_tracking_level_day_change_delete"
  AFTER DELETE ON "production"."production_day_tracking_level"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
