-- UNE FACTURE PAR MANDAT — lot E4b
-- (`documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, § 8.5)
--
-- Hugo, 2026-10-08, option (b) : quand les bons d'un payeur légal tombent sur
-- plusieurs mandats effectifs, la facture du mois se fait PAR MANDAT au lieu
-- d'être mise de côté (`invoice_split`). L'issue d'une facture du mois n'est
-- donc plus unique par (entité, mois, payeur) mais par (entité, mois, payeur,
-- mandat) : c'est cette clé qui dit « déjà facturé » au rejeu.
--
-- ADDITIVE : deux colonnes neuves (l'une avec défaut, l'autre nullable), et
-- la clé primaire ÉLARGIE d'une colonne — une contrainte relâchée, aucune
-- resserrée. Aucune ligne réécrite (le défaut `''` = « aucun mandat », la
-- clé d'une issue d'avant E4b), aucun droit accordé à un rôle.
--
-- La valeur d'énumération `CollectionExclusionReason.invoice_split` reste en
-- base : Postgres ne la retire pas, et aucune ligne ne doit perdre son motif.
--
-- Retour arrière (EN AVANT, tant qu'aucun payeur n'a deux issues pour un
-- même mois) : rétablir la clé à trois colonnes, puis `DROP COLUMN` des deux.

SET lock_timeout = '5s';

ALTER TABLE "public"."invoice_monthly_outcome"
    ADD COLUMN "mandate_id" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "mandate_reference" TEXT;

ALTER TABLE "public"."invoice_monthly_outcome"
    DROP CONSTRAINT "invoice_monthly_outcome_pkey",
    ADD CONSTRAINT "invoice_monthly_outcome_pkey"
        PRIMARY KEY ("legal_entity_id", "month", "payer_company_id", "mandate_id");
