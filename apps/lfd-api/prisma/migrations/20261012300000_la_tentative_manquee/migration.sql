-- La tentative manquée de la constitution automatique (plan
-- documentation/comptabilite/facturation/plan-rythme-de-facturation.md, §14,
-- lot R4b — Hugo, 2026-10-12 : « un lot manqué se signale et se refait à la
-- main »).
--
-- Additive : le CHECK de l'issue ADMET une valeur de plus, `missed` ; aucune
-- ligne existante ne change, aucune n'est refusée. Un passage qui trouve une
-- clôture antérieure jamais tentée range `missed` au lieu de constituer.
--
-- Retour arrière : réinstaller l'ancien CHECK après avoir vérifié qu'aucune
-- ligne ne porte `missed`.

ALTER TABLE "public"."collection_autopilot_run"
    DROP CONSTRAINT "collection_autopilot_run_outcome";

ALTER TABLE "public"."collection_autopilot_run"
    ADD CONSTRAINT "collection_autopilot_run_outcome" CHECK (
        "outcome" IN ('pending', 'constituted', 'nothing_to_collect', 'not_yet_open', 'failed', 'missed')
    );
