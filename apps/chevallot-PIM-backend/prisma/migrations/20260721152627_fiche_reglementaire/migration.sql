-- CreateTable
CREATE TABLE "nutrition_declaration" (
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

-- AddForeignKey
ALTER TABLE "nutrition_declaration" ADD CONSTRAINT "nutrition_declaration_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
