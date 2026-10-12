-- LA FACTURE PAR CLÔTURE — lot R3
-- (`documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §10)
--
-- La période facturée n'est plus un mois civil : c'est une clôture du rythme
-- de l'entité. Les deux tables de la facture du mois changent de clé :
--
--   invoice_monthly_outcome : (legal_entity_id, month, payer_company_id, mandate_id)
--                           → (legal_entity_id, period_closes_at, payer_company_id, mandate_id)
--   invoice_autopilot_run   : (legal_entity_id, month)
--                           → (legal_entity_id, period_closes_at)
--
-- Décision de Hugo (2026-10-12) : aucune facture pro n'existe encore, on garde
-- les MÊMES tables (le §9 B1 prévoyait des tables neuves pour ne pas réécrire
-- une issue `issued`, que le déclencheur `invoice_monthly_outcome_final`
-- refuse). Le garde ci-dessous rend cette prémisse VÉRIFIÉE, pas supposée :
-- s'il existe la moindre issue `issued`, la migration échoue, rien n'est écrit,
-- et le déclencheur n'est jamais désactivé.
--
-- Remplissage : `month` (`AAAA-MM`, le mois des commandes) → le 1er du mois
-- suivant à 00h00, heure de Paris — la clôture qui fermait ce mois. C'est la
-- même convention que `invoicing_floor` (20261008200000).
--
-- `month` devient NULLABLE et n'est plus écrite : colonne morte, gardée en
-- base (CLAUDE.md §0, pas de DROP). Ses CHECK de forme restent (NULL passe).
--
-- Retour arrière (en avant, tant qu'aucune ligne n'est écrite sans `month`) :
-- reposer les anciennes clés primaires, `month` NOT NULL, puis
-- `DROP COLUMN period_closes_at` sur les deux tables.

SET lock_timeout = '5s';

-- 0. Le garde : aucune issue émise. Le déclencheur refuserait de la remplir,
--    et une facture émise ne se re-clé pas sans décision.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."invoice_monthly_outcome" WHERE "outcome" = 'issued') THEN
        RAISE EXCEPTION 'la_facture_par_cloture : invoice_monthly_outcome porte au moins une issue « issued » — une facture du mois a déjà été émise. Cette migration suppose qu''aucune ne l''a été (décision du 2026-10-12) : ne pas désactiver le déclencheur, revenir au plan (§9 B1, tables neuves).';
    END IF;
END;
$$;

-- 1. L'issue par payeur et par mandat.
ALTER TABLE "public"."invoice_monthly_outcome" ADD COLUMN "period_closes_at" TIMESTAMPTZ(3);

UPDATE "public"."invoice_monthly_outcome"
SET "period_closes_at" =
    ((to_date("month" || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp)
        AT TIME ZONE 'Europe/Paris';

ALTER TABLE "public"."invoice_monthly_outcome"
    ALTER COLUMN "period_closes_at" SET NOT NULL,
    DROP CONSTRAINT "invoice_monthly_outcome_pkey",
    ADD CONSTRAINT "invoice_monthly_outcome_pkey"
        PRIMARY KEY ("legal_entity_id", "period_closes_at", "payer_company_id", "mandate_id"),
    ALTER COLUMN "month" DROP NOT NULL;

-- Le refus nomme la clôture, plus le mois (qui n'est plus écrit).
CREATE OR REPLACE FUNCTION "public"."invoice_monthly_outcome_final"() RETURNS trigger AS $$
BEGIN
    IF OLD."outcome" = 'issued' THEN
        RAISE EXCEPTION 'invoice_monthly_outcome_final: % est déjà facturé pour la clôture du %, sa facture ne se défait pas', OLD."payer_company_id", OLD."period_closes_at";
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. La tentative automatique.
ALTER TABLE "public"."invoice_autopilot_run" ADD COLUMN "period_closes_at" TIMESTAMPTZ(3);

UPDATE "public"."invoice_autopilot_run"
SET "period_closes_at" =
    ((to_date("month" || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp)
        AT TIME ZONE 'Europe/Paris';

ALTER TABLE "public"."invoice_autopilot_run"
    ALTER COLUMN "period_closes_at" SET NOT NULL,
    DROP CONSTRAINT "invoice_autopilot_run_pkey",
    ADD CONSTRAINT "invoice_autopilot_run_pkey"
        PRIMARY KEY ("legal_entity_id", "period_closes_at"),
    ALTER COLUMN "month" DROP NOT NULL;
