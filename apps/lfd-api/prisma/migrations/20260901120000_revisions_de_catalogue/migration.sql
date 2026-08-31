-- Les points d'ancrage de publication du catalogue, et leur magasin de contenus
-- adressés par empreinte.
--
-- Le magasin n'est pas une optimisation : sans lui, une révision serait une
-- copie complète du catalogue éditorial, donc trop chère pour être posée
-- souvent. Avec lui, deux révisions qui partagent 90 articles inchangés
-- partagent 90 lignes.
CREATE TABLE "pim"."catalog_content" (
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_content_pkey" PRIMARY KEY ("hash")
);

CREATE TABLE "pim"."catalog_revision" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "hash" TEXT NOT NULL,
    "header" JSONB NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL,
    "taken_by" TEXT NOT NULL,

    CONSTRAINT "catalog_revision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_revision_version_key" ON "pim"."catalog_revision"("version");
CREATE INDEX "catalog_revision_taken_at_idx" ON "pim"."catalog_revision"("taken_at");

CREATE TABLE "pim"."catalog_revision_item" (
    "revision_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,

    CONSTRAINT "catalog_revision_item_pkey" PRIMARY KEY ("revision_id","sku")
);

CREATE INDEX "catalog_revision_item_content_hash_idx" ON "pim"."catalog_revision_item"("content_hash");

ALTER TABLE "pim"."catalog_revision_item"
    ADD CONSTRAINT "catalog_revision_item_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "pim"."catalog_revision"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- `RESTRICT` et non `CASCADE` : un contenu partagé ne disparaît pas parce
-- qu'une révision le lâche. C'est toute la garantie du magasin partagé.
ALTER TABLE "pim"."catalog_revision_item"
    ADD CONSTRAINT "catalog_revision_item_content_hash_fkey"
    FOREIGN KEY ("content_hash") REFERENCES "pim"."catalog_content"("hash")
    ON DELETE RESTRICT ON UPDATE CASCADE;
