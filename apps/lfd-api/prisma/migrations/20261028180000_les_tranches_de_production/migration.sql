-- LES TRANCHES DE PRODUCTION — plan `production/plan-tranches-de-production.md`,
-- lot T1 (2026-10-28). Réglages › Production : `fixed` (des heures réglées une
-- fois, chaque besoin rangé dans la dernière au plus tard à son échéance) ou
-- `computed` (les heures des besoins eux-mêmes). Une ligne, clé naturelle
-- `house` ; ligne absente : `fixed`, aucune heure — une seule tranche, la
-- journée. Aucun droit accordé ici : la page se lit sous `production_settings`.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "production"."production_tranche_settings";

CREATE TABLE "production"."production_tranche_settings" (
    "key" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "fixed_tranches" TEXT[] NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT,

    CONSTRAINT "production_tranche_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "production_tranche_settings_single_row" CHECK ("key" = 'house'),
    CONSTRAINT "production_tranche_settings_mode" CHECK ("mode" IN ('fixed', 'computed'))
);
