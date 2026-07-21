/*
  Warnings:

  - You are about to drop the column `last_error` on the `shopify_variant_binding` table. All the data in the column will be lost.
  - You are about to drop the column `last_pushed_at` on the `shopify_variant_binding` table. All the data in the column will be lost.
  - You are about to drop the column `last_pushed_hash` on the `shopify_variant_binding` table. All the data in the column will be lost.
  - You are about to drop the column `shopify_product_gid` on the `shopify_variant_binding` table. All the data in the column will be lost.
  - You are about to drop the column `sync_status` on the `shopify_variant_binding` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "shopify_variant_binding" DROP COLUMN "last_error",
DROP COLUMN "last_pushed_at",
DROP COLUMN "last_pushed_hash",
DROP COLUMN "shopify_product_gid",
DROP COLUMN "sync_status";

-- CreateTable
CREATE TABLE "shopify_product_binding" (
    "product_id" TEXT NOT NULL,
    "shopify_product_gid" TEXT,
    "last_pushed_hash" TEXT,
    "last_pushed_at" TIMESTAMP(3),
    "sync_status" "ShopifySyncStatus" NOT NULL DEFAULT 'never_pushed',
    "last_error" TEXT,

    CONSTRAINT "shopify_product_binding_pkey" PRIMARY KEY ("product_id")
);

-- AddForeignKey
ALTER TABLE "shopify_product_binding" ADD CONSTRAINT "shopify_product_binding_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
