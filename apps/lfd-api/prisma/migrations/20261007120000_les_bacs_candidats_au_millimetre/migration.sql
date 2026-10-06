-- LES BACS CANDIDATS AU MILLIMÈTRE — `delivery.delivery_purchase_bin_candidate.*_mm`
--
-- Suite de `20261007100000_les_bacs_au_millimetre` (Hugo, 2026-10-06) : les
-- types de bacs y sont passés au millimètre, les bacs CANDIDATS de la
-- bibliothèque d'achat et l'assistant restaient en cm entiers — pré-remplir
-- l'assistant depuis la manne à pain (66,5 cm) était refusé. Une seule unité
-- côté bacs désormais ; les véhicules restent en centimètres.
--
-- Même forme que la migration des types :
-- - six colonnes `*_mm`, remplies à `cm × 10` (exact), puis NOT NULL ;
-- - le CHECK `delivery_purchase_bin_candidate_dimensions` est reporté, SOUS LE
--   MÊME NOM, sur les colonnes en millimètres ;
-- - les six colonnes `*_cm` deviennent NULLABLES et ne sont plus écrites.
--   Colonnes mortes : aucune suppression ici.
--
-- Pré-release (CLAUDE.md §0) : le binaire précédent écrit encore les `*_cm` —
-- une déclaration de candidat par lui échouerait pendant le déploiement. Assumé.
--
-- Retour arrière : `UPDATE … SET "*_cm" = "*_mm" / 10` (perd le demi-centimètre),
-- `ALTER COLUMN "*_cm" SET NOT NULL`, recréer le CHECK sur `*_cm`, puis
-- `DROP COLUMN` des six `*_mm`.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_purchase_bin_candidate"
    ADD COLUMN "outer_length_mm" INTEGER,
    ADD COLUMN "outer_width_mm" INTEGER,
    ADD COLUMN "outer_height_mm" INTEGER,
    ADD COLUMN "inner_length_mm" INTEGER,
    ADD COLUMN "inner_width_mm" INTEGER,
    ADD COLUMN "inner_height_mm" INTEGER;

UPDATE "delivery"."delivery_purchase_bin_candidate" SET
    "outer_length_mm" = "outer_length_cm" * 10,
    "outer_width_mm" = "outer_width_cm" * 10,
    "outer_height_mm" = "outer_height_cm" * 10,
    "inner_length_mm" = "inner_length_cm" * 10,
    "inner_width_mm" = "inner_width_cm" * 10,
    "inner_height_mm" = "inner_height_cm" * 10;

ALTER TABLE "delivery"."delivery_purchase_bin_candidate"
    ALTER COLUMN "outer_length_mm" SET NOT NULL,
    ALTER COLUMN "outer_width_mm" SET NOT NULL,
    ALTER COLUMN "outer_height_mm" SET NOT NULL,
    ALTER COLUMN "inner_length_mm" SET NOT NULL,
    ALTER COLUMN "inner_width_mm" SET NOT NULL,
    ALTER COLUMN "inner_height_mm" SET NOT NULL;

-- Le CHECK suit l'unité qu'on écrit ; sur des `*_cm` qui deviennent nuls, il
-- ne tiendrait plus rien.
ALTER TABLE "delivery"."delivery_purchase_bin_candidate" DROP CONSTRAINT "delivery_purchase_bin_candidate_dimensions";
ALTER TABLE "delivery"."delivery_purchase_bin_candidate" ADD CONSTRAINT "delivery_purchase_bin_candidate_dimensions" CHECK (
    "inner_length_mm" > 0 AND "inner_width_mm" > 0 AND "inner_height_mm" > 0
    AND "inner_length_mm" <= "outer_length_mm"
    AND "inner_width_mm" <= "outer_width_mm"
    AND "inner_height_mm" <= "outer_height_mm"
);

ALTER TABLE "delivery"."delivery_purchase_bin_candidate"
    ALTER COLUMN "outer_length_cm" DROP NOT NULL,
    ALTER COLUMN "outer_width_cm" DROP NOT NULL,
    ALTER COLUMN "outer_height_cm" DROP NOT NULL,
    ALTER COLUMN "inner_length_cm" DROP NOT NULL,
    ALTER COLUMN "inner_width_cm" DROP NOT NULL,
    ALTER COLUMN "inner_height_cm" DROP NOT NULL;
