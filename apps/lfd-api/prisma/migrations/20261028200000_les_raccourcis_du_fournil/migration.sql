-- LES RACCOURCIS DU FOURNIL — plan `production/plan-raccourcis-du-fournil.md`,
-- lot S1 (2026-10-28). Pour UN produit (SKU produit, identifiant opaque : la
-- production ne lit pas le catalogue), un nom (« 1 plaque ») et un nombre de
-- pièces ; au plus six par produit, plafond tenu par l'agrégat sous verrou
-- consultatif. Une suppression s'archive (`removed_at`), elle n'efface rien.
-- Aucun droit accordé ici : la page se lit sous `production_settings`.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "production"."production_batch_shortcut";

CREATE TABLE "production"."production_batch_shortcut" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "created_by_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "production_batch_shortcut_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_batch_shortcut_pieces" CHECK ("pieces" >= 1),
    CONSTRAINT "production_batch_shortcut_label" CHECK (
        "label" = btrim("label") AND char_length("label") BETWEEN 1 AND 30
    )
);

-- Jamais deux fois le même nom pour un produit, casse ignorée, parmi les vivants.
CREATE UNIQUE INDEX "production_batch_shortcut_live_label_key"
    ON "production"."production_batch_shortcut" ("sku", lower("label"))
    WHERE "removed_at" IS NULL;
