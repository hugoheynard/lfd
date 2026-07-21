-- CreateEnum
CREATE TYPE "ShopifySyncStatus" AS ENUM ('never_pushed', 'up_to_date', 'drifted', 'failed');

-- CreateTable
CREATE TABLE "shopify_settings" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "api_version" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_variant_binding" (
    "variant_id" TEXT NOT NULL,
    "channel_reference" TEXT,
    "shopify_product_gid" TEXT,
    "shopify_variant_gid" TEXT,
    "last_pushed_hash" TEXT,
    "last_pushed_at" TIMESTAMP(3),
    "sync_status" "ShopifySyncStatus" NOT NULL DEFAULT 'never_pushed',
    "last_error" TEXT,

    CONSTRAINT "shopify_variant_binding_pkey" PRIMARY KEY ("variant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_variant_binding_channel_reference_key" ON "shopify_variant_binding"("channel_reference");

-- AddForeignKey
ALTER TABLE "shopify_variant_binding" ADD CONSTRAINT "shopify_variant_binding_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
