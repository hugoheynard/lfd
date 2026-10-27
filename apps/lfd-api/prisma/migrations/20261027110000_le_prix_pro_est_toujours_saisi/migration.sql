-- LE PRIX PRO EST TOUJOURS SAISI — lot R3 de
-- `documentation/pricing/plan-retirer-le-rapport-pro.md`.
--
-- La méthode `ratio_ttc` (le prix pro déduit du prix public par le rapport)
-- est retirée du code : le prix pro HT saisi par déclinaison est la seule
-- source. Cette migration RESSERRE la contrainte de la méthode à `entered`.
--
-- 🔴 Elle REFUSE plutôt que de supposer. Une ligne encore en `ratio_ttc` vend
-- au rapport toute déclinaison sans saisie ; la basculer ici ferait sortir ces
-- déclinaisons du catalogue pro sans que personne l'ait décidé. La garde lève
-- donc AVANT toute écriture, et aucun prix ne bouge.
--
-- Le geste de sortie :
--   - en production : constater la méthode AVANT de déployer (Règles
--     comptables, constaté `entered` le 2026-10-27) ; une base en `ratio_ttc`
--     se met d'abord à jour avec le binaire d'avant (saisir les prix pro, puis
--     « Passer au prix saisi »). Un échec ici est un P3009 : voir
--     `documentation/ops/runbook.md` ;
--   - en local : « Passer au prix saisi » dans le back-office local AVANT de
--     mettre à jour, ou repartir d'une base vierge (`pnpm dev:infra:nuke`,
--     migrations, puis `pnpm --filter lfd-api seed:pim`, qui saisit désormais
--     les prix pro et n'écrit plus aucune règle comptable). Relancer
--     `seed:pim` sur une base existante ne suffit PAS : le semis ne touche
--     plus à la méthode.
--
-- ⚠️ Le bloc `DO` ci-dessous est relu tel quel par
-- `test/pro-price-entered-migration.e2e-spec.ts`, entre ses deux marqueurs.
--
-- ADDITIVE au sens de CLAUDE.md § 0 : aucune colonne retirée.
-- `pro_price_ratio_bp` reste en base et n'est plus lu ; la ligne, si elle
-- existe, n'est pas écrite.
--
-- Retour arrière : reposer `CHECK ("pro_price_method" IN ('ratio_ttc',
-- 'entered'))` et le défaut `'ratio_ttc'` — avec le binaire d'avant R3, seul à
-- savoir lire `ratio_ttc`.

SET lock_timeout = '5s';

-- garde:début
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "pim"."accounting_rules"
        WHERE "pro_price_method" <> 'entered'
    ) THEN
        RAISE EXCEPTION USING MESSAGE =
            'Le prix pro est encore déduit du prix public (méthode « ratio_ttc » dans pim.accounting_rules) : '
            || 'cette version ne sait plus le calculer, et basculer ici retirerait du catalogue pro toute déclinaison sans prix pro saisi. '
            || 'Rien n''a été écrit. En local : « Passer au prix saisi » dans Règles comptables avec la version précédente, puis relancer la migration ; ou repartir d''une base vierge (pnpm dev:infra:nuke, puis pnpm --filter lfd-api seed:pim). '
            || 'En production : voir documentation/ops/runbook.md (P3009, migrate resolve --rolled-back).';
    END IF;
END
$$;
-- garde:fin

ALTER TABLE "pim"."accounting_rules"
    ALTER COLUMN "pro_price_method" SET DEFAULT 'entered';

ALTER TABLE "pim"."accounting_rules"
    DROP CONSTRAINT "accounting_rules_method_known";

ALTER TABLE "pim"."accounting_rules"
    ADD CONSTRAINT "accounting_rules_method_known"
    CHECK ("pro_price_method" IN ('entered'));
