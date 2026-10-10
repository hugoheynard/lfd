-- Les séries de la médiathèque (2026-10-10, plan L3 « L'import » —
-- documentation/mediatheque/plan-la-mediatheque-amelioree.md, D2 et D3).
--
-- ADDITIVE : une table neuve, une colonne NULLABLE, un index, une clé
-- étrangère. Aucune image existante n'est touchée : toutes restent sans série
-- (`series_id` NULL), et la série reste facultative au dépôt (D3).
--
-- La clé étrangère est INTERNE au schéma `media` (même bloc) — elle ne
-- traverse aucune frontière. `ON DELETE RESTRICT` : une série qu'une image
-- porte ne disparaît pas sous elle ; aucune route ne supprime de série.
--
-- Retour arrière :
--   ALTER TABLE "media"."media_asset" DROP CONSTRAINT "media_asset_series_id_fkey";
--   DROP INDEX "media"."media_asset_series_id_idx";
--   ALTER TABLE "media"."media_asset" DROP COLUMN "series_id";
--   DROP TABLE "media"."media_series";
-- Aucun droit accordé.

-- CreateTable
CREATE TABLE "media"."media_series" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "shot_on" DATE,
    "note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_series_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "media"."media_asset" ADD COLUMN     "series_id" TEXT;

-- CreateIndex
CREATE INDEX "media_asset_series_id_idx" ON "media"."media_asset"("series_id");

-- AddForeignKey
ALTER TABLE "media"."media_asset" ADD CONSTRAINT "media_asset_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "media"."media_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
