-- LE COMPTE RENDU D'IMPORT CENET, LIGNE PAR LIGNE
-- (`documentation/comptabilite/prelevement/prerequis-export-ribs.md` § 2.6,
--  `documentation/comptabilite/prelevement/prerequis-export-mandats.md`)
--
-- Hugo, 2026-10-23 : « signalé comme connu par la banque » ne vaut qu'APRÈS
-- le dépôt dans CENET — c'est le compte rendu d'import qui le dit. Une fois
-- l'export marqué déposé, chaque ligne (compte ou mandat) peut recevoir UNE
-- correction tirée de ce compte rendu :
--
--   reported_by_bank  la banque l'avait déjà : il reste tenu pour connu ;
--   rejected          ligne en erreur : elle ne compte plus pour connue, et
--                     redevient « à exporter » — avec son motif, obligatoire.
--
-- ADDITIVE : quatre colonnes nullables par table, aucune reprise (aucune
-- ligne n'a de correction avant ce geste). Les CHECK ne lisent que les
-- nouvelles colonnes : toutes les lignes existantes (NULL partout) passent.
--
-- Retour arrière, par table : `DROP CONSTRAINT "<table>_correction_stamp",
-- DROP CONSTRAINT "<table>_correction_kind", DROP CONSTRAINT
-- "<table>_rejection_reason", puis DROP COLUMN des quatre colonnes` — le
-- journal garde chaque correction (`*.account_rejected`, `*.mandate_rejected`…).

SET lock_timeout = '5s';

ALTER TABLE "public"."account_bank_export_line"
    ADD COLUMN "corrected_as" TEXT,
    ADD COLUMN "corrected_at" TIMESTAMPTZ(3),
    ADD COLUMN "corrected_by_staff_id" TEXT,
    ADD COLUMN "rejection_reason" TEXT,
    ADD CONSTRAINT "account_bank_export_line_correction_stamp" CHECK (
        ("corrected_as" IS NULL) = ("corrected_at" IS NULL)
        AND ("corrected_as" IS NULL) = ("corrected_by_staff_id" IS NULL)
    ),
    ADD CONSTRAINT "account_bank_export_line_correction_kind" CHECK (
        "corrected_as" IS NULL OR "corrected_as" IN ('reported_by_bank', 'rejected')
    ),
    ADD CONSTRAINT "account_bank_export_line_rejection_reason" CHECK (
        ("corrected_as" IS NOT DISTINCT FROM 'rejected') = ("rejection_reason" IS NOT NULL)
        AND ("rejection_reason" IS NULL OR length(btrim("rejection_reason")) BETWEEN 1 AND 200)
    );

ALTER TABLE "public"."mandate_bank_export_line"
    ADD COLUMN "corrected_as" TEXT,
    ADD COLUMN "corrected_at" TIMESTAMPTZ(3),
    ADD COLUMN "corrected_by_staff_id" TEXT,
    ADD COLUMN "rejection_reason" TEXT,
    ADD CONSTRAINT "mandate_bank_export_line_correction_stamp" CHECK (
        ("corrected_as" IS NULL) = ("corrected_at" IS NULL)
        AND ("corrected_as" IS NULL) = ("corrected_by_staff_id" IS NULL)
    ),
    ADD CONSTRAINT "mandate_bank_export_line_correction_kind" CHECK (
        "corrected_as" IS NULL OR "corrected_as" IN ('reported_by_bank', 'rejected')
    ),
    ADD CONSTRAINT "mandate_bank_export_line_rejection_reason" CHECK (
        ("corrected_as" IS NOT DISTINCT FROM 'rejected') = ("rejection_reason" IS NOT NULL)
        AND ("rejection_reason" IS NULL OR length(btrim("rejection_reason")) BETWEEN 1 AND 200)
    );
