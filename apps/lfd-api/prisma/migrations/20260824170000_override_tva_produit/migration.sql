-- Un produit peut DÉROGER au taux de sa famille (O0).
--
-- La famille décide pour ses fiches ; certaines fiches ne rentrent pas dans la
-- règle de leur famille. Jusqu'ici il fallait leur inventer une famille, ce qui
-- déplace le problème : une famille de un n'est plus une famille.
--
-- Même forme que `category_context_tva`, un cran plus bas, et la même règle :
-- **l'absence de ligne est la donnée**. Pas de ligne = héritage. Ce n'est donc
-- ni une colonne, ni un `NULL` à interpréter.
CREATE TABLE "pim"."product_context_tva" (
  "product_id"  TEXT NOT NULL,
  "context_id"  TEXT NOT NULL,
  "tva_rate_id" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_context_tva_pkey" PRIMARY KEY ("product_id", "context_id")
);

CREATE INDEX "product_context_tva_tva_rate_id_idx" ON "pim"."product_context_tva"("tva_rate_id");

ALTER TABLE "pim"."product_context_tva"
  ADD CONSTRAINT "product_context_tva_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."product_context_tva"
  ADD CONSTRAINT "product_context_tva_context_id_fkey"
  FOREIGN KEY ("context_id") REFERENCES "pim"."sales_context"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- `RESTRICT`, comme pour les familles : un taux visé par une seule fiche ne se
-- supprime pas plus qu'un taux visé par une famille entière.
ALTER TABLE "pim"."product_context_tva"
  ADD CONSTRAINT "product_context_tva_tva_rate_id_fkey"
  FOREIGN KEY ("tva_rate_id") REFERENCES "pim"."tva_rate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
