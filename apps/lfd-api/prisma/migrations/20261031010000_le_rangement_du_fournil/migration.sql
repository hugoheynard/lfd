-- LE RANGEMENT DU FOURNIL (Hugo, 2026-10-30). Prévisionnel, fiche d'atelier et
-- dossier du jour rangent par catégorie RACINE ; « Afficher les
-- sous-catégories » y pose un intertitre par sous-catégorie, jamais un onglet.
-- Une ligne, clé naturelle `house` ; ligne absente : `false`. Aucun droit
-- accordé ici : la page se lit sous `production_settings`.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "production"."production_display_settings";

SET lock_timeout = '5s';

CREATE TABLE "production"."production_display_settings" (
    "key" TEXT NOT NULL,
    "show_subcategories" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT,

    CONSTRAINT "production_display_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "production_display_settings_single_row" CHECK ("key" = 'house')
);
