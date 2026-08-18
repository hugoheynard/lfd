-- L'historique du tarif canonique : append-only, une ligne par CHANGEMENT de
-- prix effectif (décision B2B si elle existe, sinon le tarif du PIM).
CREATE TABLE "public"."catalog_price_history" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_sku" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_price_history_pkey" PRIMARY KEY ("id")
);

-- La lecture datée : « quel prix pour ce produit, au plus tard à cet instant ».
CREATE INDEX "catalog_price_history_product_sku_recorded_at_idx"
    ON "public"."catalog_price_history"("product_sku", "recorded_at");

-- Le début de l'historique, en une ligne : avant lui, la frise ne peut rien dire.
CREATE INDEX "catalog_price_history_recorded_at_idx"
    ON "public"."catalog_price_history"("recorded_at");
