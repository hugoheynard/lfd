-- LES TYPES DE BACS AU MILLIMÈTRE — `delivery.delivery_bin_type.*_mm`
--
-- Décision de Hugo (2026-10-06) : une manne à pain mesure 66,5 × 46 × 71,5 cm,
-- et le centimètre entier ne savait pas l'écrire. Les dimensions d'un TYPE DE
-- BAC passent au millimètre entier ; les véhicules restent en centimètres.
--
-- - six colonnes `*_mm`, remplies à `cm × 10` (exact : la donnée était entière),
--   puis NOT NULL ;
-- - le CHECK `delivery_bin_type_dimensions` (positives, intérieur ≤ extérieur)
--   est reporté, SOUS LE MÊME NOM, sur les colonnes en millimètres ;
-- - les six colonnes `*_cm` deviennent NULLABLES et ne sont plus écrites.
--   Elles restent en base, colonnes mortes : aucune suppression ici.
--
-- Pré-release (CLAUDE.md §0, 2026-10-04) : le binaire précédent écrit encore
-- les `*_cm` et pas les `*_mm` — une création de type par lui échouerait
-- pendant le déploiement. Assumé.
--
-- Retour arrière : `UPDATE … SET "*_cm" = "*_mm" / 10` (perd le demi-centimètre),
-- `ALTER COLUMN "*_cm" SET NOT NULL`, recréer le CHECK sur `*_cm`, puis
-- `DROP COLUMN` des six `*_mm`.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_bin_type"
    ADD COLUMN "outer_length_mm" INTEGER,
    ADD COLUMN "outer_width_mm" INTEGER,
    ADD COLUMN "outer_height_mm" INTEGER,
    ADD COLUMN "inner_length_mm" INTEGER,
    ADD COLUMN "inner_width_mm" INTEGER,
    ADD COLUMN "inner_height_mm" INTEGER;

UPDATE "delivery"."delivery_bin_type" SET
    "outer_length_mm" = "outer_length_cm" * 10,
    "outer_width_mm" = "outer_width_cm" * 10,
    "outer_height_mm" = "outer_height_cm" * 10,
    "inner_length_mm" = "inner_length_cm" * 10,
    "inner_width_mm" = "inner_width_cm" * 10,
    "inner_height_mm" = "inner_height_cm" * 10;

ALTER TABLE "delivery"."delivery_bin_type"
    ALTER COLUMN "outer_length_mm" SET NOT NULL,
    ALTER COLUMN "outer_width_mm" SET NOT NULL,
    ALTER COLUMN "outer_height_mm" SET NOT NULL,
    ALTER COLUMN "inner_length_mm" SET NOT NULL,
    ALTER COLUMN "inner_width_mm" SET NOT NULL,
    ALTER COLUMN "inner_height_mm" SET NOT NULL;

-- Le CHECK suit l'unité qu'on écrit ; sur des `*_cm` qui deviennent nuls, il
-- ne tiendrait plus rien.
ALTER TABLE "delivery"."delivery_bin_type" DROP CONSTRAINT "delivery_bin_type_dimensions";
ALTER TABLE "delivery"."delivery_bin_type" ADD CONSTRAINT "delivery_bin_type_dimensions" CHECK (
    "inner_length_mm" > 0 AND "inner_width_mm" > 0 AND "inner_height_mm" > 0
    AND "inner_length_mm" <= "outer_length_mm"
    AND "inner_width_mm" <= "outer_width_mm"
    AND "inner_height_mm" <= "outer_height_mm"
);

ALTER TABLE "delivery"."delivery_bin_type"
    ALTER COLUMN "outer_length_cm" DROP NOT NULL,
    ALTER COLUMN "outer_width_cm" DROP NOT NULL,
    ALTER COLUMN "outer_height_cm" DROP NOT NULL,
    ALTER COLUMN "inner_length_cm" DROP NOT NULL,
    ALTER COLUMN "inner_width_cm" DROP NOT NULL,
    ALTER COLUMN "inner_height_cm" DROP NOT NULL;
