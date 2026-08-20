-- B4 — le référentiel rejoint la base commune, en schéma `pim`.
--
-- Il avait sa PROPRE BASE (`DATABASE_PIM_URL`), avec son client et son
-- historique de migrations. C'était l'étape B2 : fusionner les processus sans
-- toucher aux données. B4 la termine — une base, un schéma par besoin, aux
-- côtés de `public`, `growth` et `ops`.
--
-- Purement ADDITIVE : aucun `DROP`, rien de l'existant n'est touché. Les 16
-- tables naissent vides parce que la base d'origine l'était — c'est ce qui
-- rend B4 possible aujourd'hui plutôt qu'au prix d'un déplacement de données.
--
-- ⚠️ L'ancienne base n'est PAS supprimée par cette migration. Elle se retire à
-- la main, une fois la production vérifiée.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pim";

-- CreateEnum
CREATE TYPE "pim"."ProductKind" AS ENUM ('daily', 'made_to_order', 'resale');

-- CreateEnum
CREATE TYPE "pim"."ProductStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "pim"."SkuOwnerType" AS ENUM ('product', 'variant');

-- CreateEnum
CREATE TYPE "pim"."ShopifySyncStatus" AS ENUM ('never_pushed', 'up_to_date', 'drifted', 'failed');

-- CreateEnum
CREATE TYPE "pim"."ShopifyChannelMode" AS ENUM ('live', 'dry_run');

-- CreateEnum
CREATE TYPE "pim"."ShopifyPushOutcome" AS ENUM ('pushed', 'failed');

-- CreateEnum
CREATE TYPE "pim"."MediaRole" AS ENUM ('hero', 'gallery', 'lifestyle', 'thumbnail', 'print');

-- CreateTable
CREATE TABLE "pim"."sku_registry" (
    "value" TEXT NOT NULL,
    "owner_type" "pim"."SkuOwnerType" NOT NULL,
    "owner_id" TEXT NOT NULL,

    CONSTRAINT "sku_registry_pkey" PRIMARY KEY ("value")
);

-- CreateTable
CREATE TABLE "pim"."category" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "slug" JSONB NOT NULL,
    "parent_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "channel_preset" JSONB NOT NULL DEFAULT '{}',
    "emporter_tva_id" TEXT,
    "sur_place_tva_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."tva_regime" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "percent" DOUBLE PRECISION NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tva_regime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."emplacement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "click_collect" BOOLEAN NOT NULL DEFAULT false,
    "sur_place" BOOLEAN NOT NULL DEFAULT false,
    "base_url" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."emplacement_table" (
    "emplacement_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "qr_created" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,

    CONSTRAINT "emplacement_table_pkey" PRIMARY KEY ("emplacement_id","number")
);

-- CreateTable
CREATE TABLE "pim"."product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "slug" JSONB NOT NULL,
    "kind" "pim"."ProductKind" NOT NULL,
    "name" JSONB NOT NULL,
    "category_id" TEXT NOT NULL,
    "status" "pim"."ProductStatus" NOT NULL DEFAULT 'draft',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."product_variant" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_discontinued" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "price_cents" INTEGER,
    "weight_grams" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "product_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."shopify_settings" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "api_version" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."shopify_product_binding" (
    "product_id" TEXT NOT NULL,
    "shopify_product_gid" TEXT,
    "last_pushed_hash" TEXT,
    "last_pushed_at" TIMESTAMP(3),
    "sync_status" "pim"."ShopifySyncStatus" NOT NULL DEFAULT 'never_pushed',
    "last_error" TEXT,
    "head_snapshot_id" TEXT,

    CONSTRAINT "shopify_product_binding_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "pim"."shopify_push_snapshot" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "mode" "pim"."ShopifyChannelMode" NOT NULL,
    "outcome" "pim"."ShopifyPushOutcome" NOT NULL,
    "pushed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_push_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."shopify_variant_binding" (
    "variant_id" TEXT NOT NULL,
    "channel_reference" TEXT,
    "shopify_variant_gid" TEXT,

    CONSTRAINT "shopify_variant_binding_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "pim"."nutrition_declaration" (
    "variant_id" TEXT NOT NULL,
    "allergens" JSONB NOT NULL,
    "may_contain" JSONB NOT NULL DEFAULT '[]',
    "energy_kcal" DOUBLE PRECISION,
    "carbs_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "glycemic_index" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_declaration_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "pim"."product_editorial" (
    "product_id" TEXT NOT NULL,
    "description_short" JSONB,
    "description_long" JSONB,
    "story" JSONB,
    "pairing" JSONB,
    "brand" TEXT,
    "seo_title" JSONB,
    "seo_description" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_editorial_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "pim"."media_asset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" JSONB NOT NULL,
    "focal_x" DOUBLE PRECISION,
    "focal_y" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pim"."product_media" (
    "product_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "role" "pim"."MediaRole" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("product_id","media_id")
);

-- CreateTable
CREATE TABLE "pim"."b2b_channel_binding" (
    "product_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" TEXT,
    "last_pushed_at" TIMESTAMP(3),

    CONSTRAINT "b2b_channel_binding_pkey" PRIMARY KEY ("product_id")
);

-- CreateIndex
CREATE INDEX "sku_registry_owner_id_idx" ON "pim"."sku_registry"("owner_id");

-- CreateIndex
CREATE INDEX "category_parent_id_idx" ON "pim"."category"("parent_id");

-- CreateIndex
CREATE INDEX "category_emporter_tva_id_idx" ON "pim"."category"("emporter_tva_id");

-- CreateIndex
CREATE INDEX "category_sur_place_tva_id_idx" ON "pim"."category"("sur_place_tva_id");

-- CreateIndex
CREATE UNIQUE INDEX "tva_regime_tag_key" ON "pim"."tva_regime"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "pim"."product"("sku");

-- CreateIndex
CREATE INDEX "product_category_id_idx" ON "pim"."product"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_sku_key" ON "pim"."product_variant"("sku");

-- CreateIndex
CREATE INDEX "product_variant_product_id_idx" ON "pim"."product_variant"("product_id");

-- CreateIndex
CREATE INDEX "shopify_push_snapshot_handle_idx" ON "pim"."shopify_push_snapshot"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_push_snapshot_handle_version_key" ON "pim"."shopify_push_snapshot"("handle", "version");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_variant_binding_channel_reference_key" ON "pim"."shopify_variant_binding"("channel_reference");

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "pim"."product_media"("product_id");

-- AddForeignKey
ALTER TABLE "pim"."category" ADD CONSTRAINT "category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pim"."category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."category" ADD CONSTRAINT "category_emporter_tva_id_fkey" FOREIGN KEY ("emporter_tva_id") REFERENCES "pim"."tva_regime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."category" ADD CONSTRAINT "category_sur_place_tva_id_fkey" FOREIGN KEY ("sur_place_tva_id") REFERENCES "pim"."tva_regime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."emplacement_table" ADD CONSTRAINT "emplacement_table_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "pim"."emplacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "pim"."category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."product_variant" ADD CONSTRAINT "product_variant_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."shopify_product_binding" ADD CONSTRAINT "shopify_product_binding_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."shopify_variant_binding" ADD CONSTRAINT "shopify_variant_binding_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "pim"."product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."nutrition_declaration" ADD CONSTRAINT "nutrition_declaration_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "pim"."product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."product_editorial" ADD CONSTRAINT "product_editorial_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."product_media" ADD CONSTRAINT "product_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "pim"."media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pim"."b2b_channel_binding" ADD CONSTRAINT "b2b_channel_binding_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

