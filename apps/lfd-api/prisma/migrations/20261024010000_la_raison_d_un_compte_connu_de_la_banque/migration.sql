-- LA RAISON D'UN COMPTE « CONNU DE LA BANQUE »
-- (`documentation/comptabilite/prelevement/prerequis-export-ribs.md`, § 2.6)
--
-- Le geste unique « Déjà connu de la banque » devient deux (Hugo,
-- 2026-10-23) : « importé dans CENET directement » (nous l'avons saisi à la
-- main) et « signalé comme connu par la banque » (le compte rendu d'import
-- CENET, ou la banque, dit qu'il existe déjà). Les deux retirent le compte de
-- l'export ; la colonne dit pourquoi.
--
-- ADDITIVE : une colonne NOT NULL avec défaut, une contrainte que toute ligne
-- satisfait. Les déclarations existantes prennent `entered_in_cenet` : c'est
-- le seul cas que le geste unique décrivait (« saisi à la main dans CENET »).
-- Le défaut reste posé pour qu'un code encore déployé, qui n'écrit pas la
-- raison, n'échoue pas pendant la bascule. Aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (tant qu'aucune déclaration `reported_by_bank`
-- n'existe en production) : `ALTER TABLE "public"."known_bank_account" DROP
-- CONSTRAINT "known_bank_account_reason_known", DROP COLUMN "reason"`. Après :
-- NE PAS le faire — la raison d'une déclaration serait perdue.

SET lock_timeout = '5s';

ALTER TABLE "public"."known_bank_account"
    ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'entered_in_cenet',
    ADD CONSTRAINT "known_bank_account_reason_known" CHECK (
        "reason" IN ('entered_in_cenet', 'reported_by_bank')
    );
