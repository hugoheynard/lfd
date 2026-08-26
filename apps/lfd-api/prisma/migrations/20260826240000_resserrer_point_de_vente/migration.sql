-- Le point de vente, tranche p-3 : RESSERRER.
--
-- Les lectures sont basculées depuis p-2. Cette migration retire ce que plus
-- personne ne lit — et fusionne `emplacement` dans `point_of_sale`, dont il
-- n'était qu'un cas. Voir `documentation/pim/point-de-vente.md`.

-- 1. Le dernier remplissage. Une ligne écrite par le binaire de p-0 PENDANT le
-- déploiement de p-1 n'a pas de `point_of_sale_id` ; sans ce rattrapage, le
-- `NOT NULL` ci-dessous échouerait sur elle — et c'est très exactement quand on
-- ne veut pas d'une migration qui casse.
UPDATE "pim"."category_channel"
  SET "point_of_sale_id" = COALESCE("location_id", 'pos_b2b')
  WHERE "point_of_sale_id" IS NULL;
UPDATE "pim"."product_channel"
  SET "point_of_sale_id" = COALESCE("location_id", 'pos_b2b')
  WHERE "point_of_sale_id" IS NULL;

ALTER TABLE "pim"."category_channel" ALTER COLUMN "point_of_sale_id" SET NOT NULL;
ALTER TABLE "pim"."product_channel"  ALTER COLUMN "point_of_sale_id" SET NOT NULL;

-- 2. L'unicité change de colonne — et perd `NULLS NOT DISTINCT`.
--
-- Il existait pour une seule raison : `location_id` était nullable, et sans lui
-- la ligne du B2B aurait été la SEULE que l'index ne protégeait pas. Plus de
-- colonne nullable dans la clé, donc plus besoin de l'exception.
DROP INDEX "pim"."category_channel_unique";
DROP INDEX "pim"."product_channel_unique";

CREATE UNIQUE INDEX "category_channel_unique"
  ON "pim"."category_channel" ("category_id", "point_of_sale_id", "context_key");
CREATE UNIQUE INDEX "product_channel_unique"
  ON "pim"."product_channel" ("product_id", "point_of_sale_id", "context_key");

ALTER TABLE "pim"."category_channel" DROP COLUMN "location_id";
ALTER TABLE "pim"."product_channel"  DROP COLUMN "location_id";

-- 3. La grille de tables déménage. C'est de l'ÉQUIPEMENT d'une boutique, pas
-- un mode de vente : deux boulangeries peuvent toutes deux servir en salle et
-- une seule être équipée de QR — ce que le modèle précédent ne savait pas dire.
--
-- Un RENAME, pas une copie : les identifiants d'un point de vente boutique sont
-- ceux de son emplacement (p-0), donc les lignes valent déjà. Les jetons de QR
-- imprimés survivent — les recréer les aurait invalidés en silence.
ALTER TABLE "pim"."emplacement_table" RENAME TO "point_of_sale_table";
ALTER TABLE "pim"."point_of_sale_table" RENAME COLUMN "emplacement_id" TO "point_of_sale_id";
ALTER TABLE "pim"."point_of_sale_table"
  DROP CONSTRAINT "emplacement_table_emplacement_id_fkey";
ALTER TABLE "pim"."point_of_sale_table"
  ADD CONSTRAINT "point_of_sale_table_point_of_sale_id_fkey"
  FOREIGN KEY ("point_of_sale_id") REFERENCES "pim"."point_of_sale" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX "pim"."emplacement_table_pkey" RENAME TO "point_of_sale_table_pkey";

-- 4. L'unicité du libellé déménage avec sa source. Sur `lower(label)`, comme
-- avant sur `lower(name)` : « Village » et « village » sont le même point de
-- vente pour qui lit l'écran.
CREATE UNIQUE INDEX "point_of_sale_label_unique" ON "pim"."point_of_sale" (LOWER("label"));

-- 5. Ce que plus personne ne lit.
--
-- `location_context` disparaît : `point_of_sale_context` le remplace, et sait
-- en plus parler de la plateforme. `per_location` disparaît : c'est le point de
-- vente qui déclare ce qu'il offre, pas le contexte qui déclare s'il lui faut
-- un lieu.
DROP TABLE "pim"."location_context";
ALTER TABLE "pim"."sales_context" DROP COLUMN "per_location";
DROP TABLE "pim"."emplacement";

-- 6. Le journal parle la même langue que le modèle.
--
-- `location.*` et le sujet `location` sont des DONNÉES : elles vivent dans des
-- lignes déjà écrites. Les laisser telles quelles ferait un journal où la
-- moitié des gestes portent le nom d'une table qui n'existe plus — et personne
-- ne saurait, dans six mois, que les deux mots désignent la même chose.
UPDATE "growth"."activity_events"
  SET "type" = 'point_of_sale' || SUBSTRING("type" FROM 9)
  WHERE "type" LIKE 'location.%';
UPDATE "growth"."activity_events"
  SET "subject_type" = 'point_of_sale'
  WHERE "subject_type" = 'location';
