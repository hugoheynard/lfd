-- Une famille porte des TEXTES et des VISUELS.
--
-- Purement ADDITIVE : deux tables neuves, aucune colonne touchée, aucune donnée
-- déplacée. Le binaire qui tourne aujourd'hui ne lit ni l'une ni l'autre et
-- continue de fonctionner — c'est le temps « étendre » de
-- `documentation/ops/pipelines.md`, et il n'y a ici ni « basculer » ni
-- « resserrer » à prévoir : rien n'est remplacé.
--
-- `media_asset` est la bibliothèque DÉJÀ EN PLACE, celle des fiches. Un même
-- fichier sert donc une famille et une fiche sans être déposé deux fois. La
-- conséquence est ailleurs, dans le code : le ramassage d'orphelins concluait
-- d'un « aucune fiche ne le porte » qu'un objet ne servait plus. Ce n'est plus
-- vrai, et la requête est corrigée dans le même lot.

CREATE TABLE "pim"."category_editorial" (
    "category_id" TEXT NOT NULL,
    "description_short" JSONB,
    "description_long" JSONB,
    "seo_title" JSONB,
    "seo_description" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_editorial_pkey" PRIMARY KEY ("category_id")
);

CREATE TABLE "pim"."category_media" (
    "category_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "role" "pim"."MediaRole" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_media_pkey" PRIMARY KEY ("category_id","media_id")
);

CREATE INDEX "category_media_category_id_idx" ON "pim"."category_media"("category_id");

-- `CASCADE` vers la famille : les textes et les rattachements n'ont aucune vie
-- sans elle. `RESTRICT` (défaut) vers la bibliothèque, pour la raison inverse —
-- un visuel qu'une famille porte ne doit pas pouvoir disparaître sous elle.
ALTER TABLE "pim"."category_editorial"
  ADD CONSTRAINT "category_editorial_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "pim"."category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."category_media"
  ADD CONSTRAINT "category_media_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "pim"."category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."category_media"
  ADD CONSTRAINT "category_media_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "pim"."media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
