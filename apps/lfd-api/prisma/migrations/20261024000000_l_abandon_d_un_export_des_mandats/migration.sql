-- L'ABANDON D'UN EXPORT DES MANDATS POUR LA BANQUE
-- (`documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`, § 7 S3, lot P1)
--
-- Un export que la banque a rejeté restait « en attente » pour toujours : rien
-- ne le fermait sans dire qu'il était importé. Deux colonnes, calquées sur
-- `account_bank_export` : « abandonné » se dit par instant ET auteur, et un
-- export se clôt une fois, importé OU abandonné.
--
-- ADDITIVE : deux colonnes nullables, deux contraintes que toute ligne
-- existante satisfait (les deux colonnes y sont NULL). Aucune ligne modifiée,
-- aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (tant qu'aucun export n'a été abandonné en
-- production) : `ALTER TABLE "public"."mandate_bank_export" DROP CONSTRAINT
-- "mandate_bank_export_closed_once", DROP CONSTRAINT
-- "mandate_bank_export_abandoned_stamp", DROP COLUMN "abandoned_by_staff_id",
-- DROP COLUMN "abandoned_at"`. Après : NE PAS le faire — un export abandonné
-- redeviendrait « en attente ».

SET lock_timeout = '5s';

ALTER TABLE "public"."mandate_bank_export"
    ADD COLUMN "abandoned_at" TIMESTAMPTZ(3),
    ADD COLUMN "abandoned_by_staff_id" TEXT,
    ADD CONSTRAINT "mandate_bank_export_abandoned_stamp" CHECK (
        ("abandoned_at" IS NULL) = ("abandoned_by_staff_id" IS NULL)
    ),
    ADD CONSTRAINT "mandate_bank_export_closed_once" CHECK (
        "imported_at" IS NULL OR "abandoned_at" IS NULL
    );
