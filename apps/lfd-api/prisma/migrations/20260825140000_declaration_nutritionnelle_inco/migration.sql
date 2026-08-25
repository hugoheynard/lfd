-- La déclaration nutritionnelle rejoint celle que le règlement impose.
--
-- L'annexe XV du règlement UE 1169/2011 fixe la liste ET l'ordre : énergie,
-- matières grasses, dont acides gras saturés, glucides, dont sucres, protéines,
-- sel. Il manquait les trois « dont/sel » — une fiche complète à l'écran
-- produisait donc un tableau non conforme, sans que rien ne le dise.
--
-- Purement additif : trois colonnes facultatives. `null` = non renseigné, comme
-- ses voisines — à ne pas confondre avec zéro, qui est une valeur déclarée.
ALTER TABLE "pim"."nutrition_declaration"
  ADD COLUMN "saturated_fat_g" DOUBLE PRECISION,
  ADD COLUMN "sugars_g"        DOUBLE PRECISION,
  ADD COLUMN "salt_g"          DOUBLE PRECISION;
