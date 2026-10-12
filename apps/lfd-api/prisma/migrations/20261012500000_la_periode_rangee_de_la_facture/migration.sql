-- La période de la facture, rangée sur son issue (plan
-- documentation/comptabilite/facturation/plan-rythme-de-facturation.md, §16.9,
-- lot M4a — Hugo, 2026-10-12 : « oui aux trois »).
--
-- Depuis M1, chaque payeur a son mode : la clôture rangée
-- (`period_closes_at`) ne suffit plus à retrouver le début de la période, que
-- le lecteur recalculait sous le mode MENSUEL de l'entité. Le début est
-- désormais écrit à l'émission — la clôture précédente RÉELLE du payeur.
--
-- Additive : une colonne NULLABLE. Les issues déjà écrites la gardent NULL
-- (aucune en production au 2026-10-12) ; le lecteur retombe alors sur le
-- calcul d'avant. Aucune ligne n'est mise à jour : le déclencheur
-- `invoice_monthly_outcome_final` refuserait de toucher une issue `issued`,
-- et la valeur s'écrit à l'INSERT (ou à la bascule d'un refus en émission,
-- que le déclencheur admet).
--
-- Retour arrière : `DROP COLUMN period_starts_at` (rien ne la lit sans repli).

ALTER TABLE "public"."invoice_monthly_outcome"
    ADD COLUMN "period_starts_at" TIMESTAMPTZ(3);

ALTER TABLE "public"."invoice_monthly_outcome"
    ADD CONSTRAINT "invoice_monthly_outcome_period_order"
        CHECK ("period_starts_at" IS NULL OR "period_starts_at" < "period_closes_at");
