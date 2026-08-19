-- CreateEnum
CREATE TYPE "MediaRole" AS ENUM ('hero', 'gallery', 'lifestyle', 'thumbnail', 'print');

-- CreateTable
CREATE TABLE "product_editorial" (
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
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" JSONB NOT NULL,
    "focal_x" DOUBLE PRECISION,
    "focal_y" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "product_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "role" "MediaRole" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("product_id","media_id")
);

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

-- AddForeignKey
ALTER TABLE "product_editorial" ADD CONSTRAINT "product_editorial_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
