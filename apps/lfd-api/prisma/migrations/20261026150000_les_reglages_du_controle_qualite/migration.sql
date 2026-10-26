-- LES RÉGLAGES DU CONTRÔLE QUALITÉ — décision de Hugo, 2026-10-26 : dans
-- Réglages › Commandes, « Contrôle qualité au fournil » (lignes de
-- préparation) DÉSACTIVÉ par défaut, « Contrôle qualité au colisage »
-- (commandes colisées) activé par défaut — le comportement d'avant. Une ligne,
-- clé naturelle `quality` ; ligne absente : ces défauts. Aucun droit accordé
-- ici : la page se lit sous `lfc_order_settings`, déjà réglé à l'écran.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "production"."production_quality_settings";

CREATE TABLE "production"."production_quality_settings" (
    "key" TEXT NOT NULL,
    "line_checks" BOOLEAN NOT NULL DEFAULT false,
    "order_checks" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "production_quality_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "production_quality_settings_single_row" CHECK ("key" = 'quality')
);
