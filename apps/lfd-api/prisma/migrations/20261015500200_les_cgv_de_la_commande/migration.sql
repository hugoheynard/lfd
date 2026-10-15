-- LES CGV PORTÉES PAR LA COMMANDE (Hugo, 2026-10-15)
--
-- Plan `documentation/legal/plan-cgv-par-audience.md`, C4 et C4′. Posées à la
-- passation, sur les trois chemins, d'après l'audience qui tarifie la commande.
--
-- ADDITIVE : trois colonnes NULLABLES. Les commandes passées avant restent
-- sans version — on n'en invente pas, aucune ligne n'est réécrite.
--
-- La clé est tenue par un CHECK ; le fichier par une clé étrangère RESTRICT
-- vers `legal_document_files`, qui de toute façon refuse le DELETE.

ALTER TABLE "public"."orders"
  ADD COLUMN "sales_terms_key" TEXT,
  ADD COLUMN "sales_terms_revision" INTEGER,
  ADD COLUMN "sales_terms_file_id" TEXT;

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_sales_terms_key_check"
    CHECK ("sales_terms_key" IS NULL OR "sales_terms_key" IN ('sales-terms', 'sales-terms-pro'));

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_sales_terms_revision_check"
    CHECK ("sales_terms_revision" IS NULL OR "sales_terms_revision" > 0);

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_sales_terms_file_id_fkey"
    FOREIGN KEY ("sales_terms_file_id") REFERENCES "public"."legal_document_files"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
