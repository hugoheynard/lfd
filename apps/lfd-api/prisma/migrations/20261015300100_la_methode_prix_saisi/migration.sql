-- LA MÉTHODE « PRIX SAISI » — lot P (P3) de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md`.
--
-- Le mur posé par `20260913140000_retrait_methode_plaquette` n'admettait que
-- `ratio_ttc` : choisir `entered` échouerait sur une erreur de base. On
-- l'ÉLARGIT — aucune ligne existante ne peut violer la nouvelle contrainte, et
-- la méthode en place ne change pas (`ratio_ttc` tant que Hugo n'a pas basculé).
--
-- Retour arrière : reposer `CHECK ("pro_price_method" IN ('ratio_ttc'))`, après
-- avoir remis la méthode sur `ratio_ttc`.

SET lock_timeout = '5s';

ALTER TABLE "pim"."accounting_rules"
    DROP CONSTRAINT "accounting_rules_method_known";

ALTER TABLE "pim"."accounting_rules"
    ADD CONSTRAINT "accounting_rules_method_known"
    CHECK ("pro_price_method" IN ('ratio_ttc', 'entered'));
