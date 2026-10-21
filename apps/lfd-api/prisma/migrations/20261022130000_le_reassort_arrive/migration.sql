-- LE RÉASSORT ARRIVÉ (lot R3e de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md — Hugo
-- 2026-10-21 : « un seul signal, deux gestes »).
--
-- `site_resupply.arrived_*` : l'instant et l'auteur figé du signal « il est
-- là » — la réception au site du transfert qui le porte (point servi par
-- transfert), ou « Monté » au fournil (point servi sur place). Tous NULL tant
-- qu'il est attendu. Entier ou absent (CHECK `site_resupply_arrival_whole`),
-- et jamais sur une demande en cours (CHECK `site_resupply_arrival_placed`).
--
-- ADDITIVE : quatre colonnes nullables et deux CHECK que toutes les lignes
-- existantes tiennent (colonnes neuves, toutes NULL). Rien de retiré ni de
-- renommé. Aucun droit accordé.
--
-- Retour arrière du SCHÉMA : `DROP CONSTRAINT` des deux CHECK puis
-- `DROP COLUMN` des quatre colonnes, une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "public"."site_resupply"
  ADD COLUMN "arrived_at" TIMESTAMP(3),
  ADD COLUMN "arrived_by_staff_id" TEXT,
  ADD COLUMN "arrived_by_name" TEXT,
  ADD COLUMN "arrived_by_role" TEXT,
  ADD CONSTRAINT "site_resupply_arrival_whole" CHECK (
    ("arrived_at" IS NULL AND "arrived_by_staff_id" IS NULL
      AND "arrived_by_name" IS NULL AND "arrived_by_role" IS NULL)
    OR ("arrived_at" IS NOT NULL AND "arrived_by_staff_id" IS NOT NULL
      AND "arrived_by_name" IS NOT NULL AND "arrived_by_role" IS NOT NULL)
  ),
  ADD CONSTRAINT "site_resupply_arrival_placed" CHECK (
    "arrived_at" IS NULL OR "placed_at" IS NOT NULL
  );
