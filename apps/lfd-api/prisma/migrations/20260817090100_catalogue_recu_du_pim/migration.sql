-- CreateTable
CREATE TABLE "catalog_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_percent" DECIMAL(5,2) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "sku" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "weight_grams" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "catalog_item_overrides" (
    "sku" TEXT NOT NULL,
    "price_cents" INTEGER,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_item_overrides_pkey" PRIMARY KEY ("sku")
);

-- CreateIndex
CREATE INDEX "catalog_items_category_id_idx" ON "catalog_items"("category_id");

-- CreateIndex
CREATE INDEX "catalog_items_product_id_idx" ON "catalog_items"("product_id");

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_item_overrides" ADD CONSTRAINT "catalog_item_overrides_sku_fkey" FOREIGN KEY ("sku") REFERENCES "catalog_items"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

