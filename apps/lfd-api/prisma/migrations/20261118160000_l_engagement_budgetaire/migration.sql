-- L'ENGAGEMENT BUDGÉTAIRE SUR LA COMMANDE ET LA FACTURE
-- (documentation/comptabilite/facturation/plan-clients-publics-chorus.md,
-- § 6 quater, lot P2, « Après contradiction » E2′–E11).
--
-- Un organisme public commande sous un bon de commande qui porte un numéro
-- d'engagement (BT-13) et, souvent, un code service (BT-10). La commande les
-- porte ; la facture les fige à l'émission ; une facture ne mélange jamais
-- deux engagements : la clé d'une facture dans sa période devient (payeur,
-- mandat, numéro, code service).
--
-- ADDITIVE :
--   · `orders` : deux colonnes nullables. NULL = aucun engagement (tout payeur
--     privé, et toute commande d'avant).
--   · `invoice` : deux colonnes nullables, posées à l'INSERT. Le déclencheur
--     `invoice_immutable` compare la ligne entière (`to_jsonb`) : il couvre
--     les colonnes neuves sans changement.
--   · `invoice_monthly_outcome` : deux colonnes NOT NULL DEFAULT '' (la chaîne
--     vide = aucun engagement, comme `mandate_id`), et la clé primaire ÉLARGIE
--     de ces deux colonnes — une contrainte relâchée, aucune resserrée (même
--     geste que `20261008210000_une_facture_par_mandat`). `ADD COLUMN … DEFAULT`
--     ne déclenche pas `invoice_monthly_outcome_final` : aucune ligne n'est
--     réécrite.
-- Aucun droit accordé à un rôle.
--
-- Retour arrière : `prisma/rollback/20261118160000_l_engagement_budgetaire.sql`.
SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
    ADD COLUMN "budget_commitment_number" TEXT,
    ADD COLUMN "budget_commitment_service_code" TEXT;

ALTER TABLE "public"."invoice"
    ADD COLUMN "budget_commitment_number" TEXT,
    ADD COLUMN "budget_commitment_service_code" TEXT;

ALTER TABLE "public"."invoice_monthly_outcome"
    ADD COLUMN "budget_commitment_number" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "budget_commitment_service_code" TEXT NOT NULL DEFAULT '';

ALTER TABLE "public"."invoice_monthly_outcome"
    DROP CONSTRAINT "invoice_monthly_outcome_pkey",
    ADD CONSTRAINT "invoice_monthly_outcome_pkey"
        PRIMARY KEY (
            "legal_entity_id",
            "period_closes_at",
            "payer_company_id",
            "mandate_id",
            "budget_commitment_number",
            "budget_commitment_service_code"
        );
