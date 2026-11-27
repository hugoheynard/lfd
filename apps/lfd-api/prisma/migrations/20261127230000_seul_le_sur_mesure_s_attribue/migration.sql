-- SEUL LE SUR MESURE S'ATTRIBUE — décision de Hugo, 2026-11-27
-- (`documentation/catalogue/plan-fin-du-sur-mesure.md`, D2, D3, D5).
--
-- Invariant : un article qui n'est pas sur mesure n'a aucune attribution.
-- Un refus dans le handler ne suffit pas (il lit l'article sans verrou, et
-- l'abonné de la fiche écrit `custom_recipe` dans une autre transaction) :
-- la base le rend impossible. Chaque attribution porte `custom_recipe`,
-- toujours vrai, et sa clé étrangère vise `(sku, custom_recipe)` de
-- l'article. Passer à `false` un article encore attribué viole la clé.
--
-- 🔴 Ne se déploie qu'APRÈS le rapprochement de l'existant (opération
-- d'après déploiement « Les articles attribués passent sur mesure », D5) :
-- une attribution sur un article ordinaire fait ÉCHOUER cette migration.
-- Elle n'efface rien.
--
-- Aucun droit accordé ici.

CREATE UNIQUE INDEX "catalog_items_sku_custom_recipe_key"
  ON "public"."catalog_items" ("sku", "custom_recipe");

ALTER TABLE "public"."catalog_item_reservations"
  ADD COLUMN "custom_recipe" BOOLEAN NOT NULL DEFAULT true,
  ADD CONSTRAINT "catalog_item_reservations_custom_recipe_check" CHECK ("custom_recipe");

ALTER TABLE "public"."catalog_item_reservations"
  DROP CONSTRAINT "catalog_item_reservations_sku_fkey";

ALTER TABLE "public"."catalog_item_reservations"
  ADD CONSTRAINT "catalog_item_reservations_sku_custom_recipe_fkey"
  FOREIGN KEY ("sku", "custom_recipe")
  REFERENCES "public"."catalog_items" ("sku", "custom_recipe")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
