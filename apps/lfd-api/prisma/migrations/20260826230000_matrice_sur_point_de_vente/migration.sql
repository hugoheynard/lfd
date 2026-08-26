-- Le point de vente, tranche p-1 : ÉTENDRE.
--
-- La matrice cite un EMPLACEMENT, et `NULL` y veut dire « le B2B ». Elle
-- apprend à citer un point de vente, qui sait nommer les deux. La colonne
-- reste NULLABLE et `location_id` reste écrite : le binaire en ligne pendant le
-- déploiement n'écrit encore que la seconde, et une colonne `NOT NULL` qu'il
-- ignore ferait échouer toutes ses écritures.
--
-- p-2 bascule les lectures, p-3 supprime `location_id`
-- (`documentation/ops/pipelines.md`, `documentation/pim/point-de-vente.md`).

ALTER TABLE "pim"."category_channel" ADD COLUMN "point_of_sale_id" TEXT;
ALTER TABLE "pim"."product_channel"  ADD COLUMN "point_of_sale_id" TEXT;

-- Reprise. `COALESCE` porte toute la règle de traduction : une boutique garde
-- l'identifiant de son emplacement (p-0), et le `NULL` qui voulait dire « le
-- B2B » devient la ligne qui le dit.
UPDATE "pim"."category_channel" SET "point_of_sale_id" = COALESCE("location_id", 'pos_b2b');
UPDATE "pim"."product_channel"  SET "point_of_sale_id" = COALESCE("location_id", 'pos_b2b');

CREATE INDEX "category_channel_point_of_sale_id_idx"
  ON "pim"."category_channel" ("point_of_sale_id");
CREATE INDEX "product_channel_point_of_sale_id_idx"
  ON "pim"."product_channel" ("point_of_sale_id");

-- Le mur, cette fois porté par une vraie clé étrangère et non par un registre
-- de substitution : un point de vente encore vendu ne se supprime pas.
ALTER TABLE "pim"."category_channel"
  ADD CONSTRAINT "category_channel_point_of_sale_id_fkey"
  FOREIGN KEY ("point_of_sale_id") REFERENCES "pim"."point_of_sale" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."product_channel"
  ADD CONSTRAINT "product_channel_point_of_sale_id_fkey"
  FOREIGN KEY ("point_of_sale_id") REFERENCES "pim"."point_of_sale" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
