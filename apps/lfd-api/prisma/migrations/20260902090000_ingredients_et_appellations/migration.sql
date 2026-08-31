-- Deux référentiels de PROVENANCE, et la liaison qui les cite.
--
-- ⚠️ Ce n'est pas la liste réglementaire d'ingrédients (règlement UE
-- 1169/2011) : celle-là est ordonnée par masse, porte des quantités, décrit une
-- recette, et vit avec les allergènes sur la DÉCLINAISON. Ici on déclare d'où
-- vient ce qu'il y a dedans — une matière éditoriale, portée par le produit.
CREATE TABLE "pim"."appellation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "scheme" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appellation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appellation_code_key" ON "pim"."appellation"("code");

CREATE TABLE "pim"."ingredient" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "origin" TEXT NOT NULL DEFAULT '',
    "appellation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_key_key" ON "pim"."ingredient"("key");
CREATE INDEX "ingredient_appellation_id_idx" ON "pim"."ingredient"("appellation_id");

-- `RESTRICT` : une appellation citée ne disparaît pas sous l'ingrédient qui
-- l'affirme. Un badge « AOP » sans appellation serait une affirmation orpheline.
ALTER TABLE "pim"."ingredient"
  ADD CONSTRAINT "ingredient_appellation_id_fkey"
  FOREIGN KEY ("appellation_id") REFERENCES "pim"."appellation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pim"."product_ingredient" (
    "product_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_ingredient_pkey" PRIMARY KEY ("product_id","ingredient_id")
);

CREATE INDEX "product_ingredient_ingredient_id_idx" ON "pim"."product_ingredient"("ingredient_id");

-- La fiche effacée emporte ses citations ; l'ingrédient, lui, est un
-- référentiel et ne s'efface pas sous les fiches qui le citent.
ALTER TABLE "pim"."product_ingredient"
  ADD CONSTRAINT "product_ingredient_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."product_ingredient"
  ADD CONSTRAINT "product_ingredient_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "pim"."ingredient"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
