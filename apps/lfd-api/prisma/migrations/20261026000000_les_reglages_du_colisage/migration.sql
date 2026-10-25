-- LES RÉGLAGES DU COLISAGE — Hugo, 2026-10-25 : « partager une moitié devrait
-- être un réglage dans réglages/colisage, on devrait commencer avec ça
-- désactivé ». Une ligne, clé naturelle `packing` ; ligne absente : les
-- défauts, partage fermé. Aucun droit accordé ici : la page se lit sous
-- `delivery_settings`, déjà réglé à l'écran.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "packing"."packing_settings";

CREATE TABLE "packing"."packing_settings" (
    "key" TEXT NOT NULL,
    "half_sharing" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "packing_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "packing_settings_single_row" CHECK ("key" = 'packing')
);
