-- CreateTable
CREATE TABLE "b2b_channel_binding" (
    "product_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" TEXT,
    "last_pushed_at" TIMESTAMP(3),

    CONSTRAINT "b2b_channel_binding_pkey" PRIMARY KEY ("product_id")
);

-- AddForeignKey
ALTER TABLE "b2b_channel_binding" ADD CONSTRAINT "b2b_channel_binding_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

