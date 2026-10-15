-- L'OPÉRATION AU COMMERCE — lot 1 (Hugo, 2026-10-15)
--
-- Plan `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`
-- (O1, « Corrections après vitruve ») : `catalog_operations` devient la
-- source des opérations. Le lot 1 lui donne ce que l'agrégat du commerce
-- écrit et que le miroir n'avait pas :
--
--   - `hidden`     — masquée, réversible, distinct de l'archivage
--                    (`withdrawn_at`, qui garde son sens : retirée) ;
--   - `written_by` — qui l'a écrite au commerce en dernier (`StaffUser.id`) ;
--   - `written_at` — quand.
--
-- **Additif et sans effet à la pose** : trois colonnes, l'une à défaut
-- `false`, les deux autres nullables. Aucune colonne existante n'est
-- modifiée, aucune ligne réécrite, aucune lecture ne les consulte : les
-- routes qui les écrivent sont FERMÉES (`OPERATIONS_AT_COMMERCE`) jusqu'à la
-- bascule (lot 3).
--
-- Retour arrière :
--   ALTER TABLE "public"."catalog_operations"
--     DROP COLUMN "written_at", DROP COLUMN "written_by", DROP COLUMN "hidden";

ALTER TABLE "public"."catalog_operations"
    ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "written_by" TEXT,
    ADD COLUMN "written_at" TIMESTAMPTZ(3);
