-- LES FAVORIS DE LA BOUTIQUE — une table neuve
-- (documentation/commandes/boutique/les-favoris.md, lot B1).
--
-- ADDITIVE : une table neuve, vide. Aucune colonne existante touchée ; les
-- binaires en place ne la lisent pas.
--
-- `shop_favorite` : un SKU gardé par un espace — une société
-- (`holder_type = 'company'`) ou l'espace personnel d'une personne (`'user'`).
-- Ni clé vers le référentiel (le SKU est opaque), ni clé vers le titulaire
-- (deux tables possibles) ; la clé primaire rend la pose idempotente.
--
-- Retour arrière : `prisma/rollback/20261126190000_les_favoris_de_la_boutique.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."shop_favorite" (
    "holder_type" TEXT NOT NULL,
    "holder_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_favorite_pkey" PRIMARY KEY ("holder_type","holder_id","sku"),
    CONSTRAINT "shop_favorite_holder_type_known" CHECK ("holder_type" IN ('company', 'user'))
);
