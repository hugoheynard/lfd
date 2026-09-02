-- Les VERSIONS du catalogue accepté, et la référence portée par les commandes.
--
-- Strictement additive : une table neuve et vide, plus une colonne nullable sur
-- `orders`. Rien de ce qui est en vente ne change d'état au déploiement, et
-- aucun contrat déjà servi ne bouge.

-- La photographie complète du miroir des faits, prise après une validation.
-- `items` porte les faits PIM SKU par SKU, au prix REÇU — jamais l'effectif,
-- qui bouge sans qu'aucune livraison n'arrive et rendrait faux un objet immuable.
CREATE TABLE "public"."catalog_versions" (
    "id"            TEXT         NOT NULL,
    "delivery_id"   TEXT         NOT NULL,
    "revision_id"   TEXT         NOT NULL,
    "fingerprint"   TEXT         NOT NULL,
    "excluded_skus" JSONB        NOT NULL,
    "items"         JSONB        NOT NULL,
    "item_count"    INTEGER      NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL,
    "created_by"    TEXT,

    CONSTRAINT "catalog_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_versions_created_at_idx" ON "public"."catalog_versions" ("created_at");

-- `NULL` = « on ne sait pas », et c'est la vérité : toute commande antérieure à
-- la première validation en est là. Le même sens net que `pricing_steps` sur la
-- ligne — jamais un défaut fabriqué.
ALTER TABLE "public"."orders" ADD COLUMN "catalog_version_id" TEXT;

-- `RESTRICT` : une version citée par une commande est immortelle. C'est ce qui
-- fait tenir « une version est immuable » au-delà du code — purger l'archive ne
-- peut pas rendre une commande inintelligible.
ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_catalog_version_id_fkey"
    FOREIGN KEY ("catalog_version_id") REFERENCES "public"."catalog_versions" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
