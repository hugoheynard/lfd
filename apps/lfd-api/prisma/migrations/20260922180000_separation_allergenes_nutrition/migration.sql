-- Lot 1 de `documentation/pim/plan-separer-allergenes-et-nutrition.md`.
--
-- Deux tables VIDES, que personne ne lit ni n'écrit encore. La fiche
-- réglementaire continue de vivre dans `nutrition_declaration` jusqu'au lot 5 ;
-- celle-ci part au lot 7.
--
-- 🔴 AUCUNE REPRISE, et c'est mesuré, pas supposé : le référentiel porte 92
-- fiches et ZÉRO `nutrition_declaration` au 2026-09-22. Il n'y a rien à
-- recopier. Les versions 2 à 4 du plan avaient écrit une bascule en trois
-- déploiements pour zéro ligne.
--
-- ⚠️ Écrite À LA MAIN plutôt que par `prisma migrate dev`. Celui-ci exige de
-- remettre la base de développement à blanc (dix-sept migrations appliquées ont
-- été modifiées par un refactor passé), et son `diff` propose en prime de
-- SUPPRIMER quatre index uniques posés en SQL à la main — que le schéma Prisma
-- ne sait pas déclarer. Les recopier ici les aurait détruits.

-- **Ce que la déclinaison CONTIENT** — la déclaration de sécurité.
--
-- L'absence de ligne est un ÉTAT : elle dit « personne ne s'est prononcé ».
-- `allergens = '[]'` dit autre chose — « aucun allergène », une affirmation
-- positive. C'est toute la raison d'être de la séparation : écrire une valeur
-- nutritionnelle ne peut plus créer d'affirmation d'allergène, parce qu'il n'y
-- a pas de colonne à remplir.
CREATE TABLE "pim"."variant_allergens" (
    "variant_id" TEXT NOT NULL,
    "allergens" JSONB NOT NULL,
    "may_contain" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_allergens_pkey" PRIMARY KEY ("variant_id")
);

-- **Ce que la déclinaison VAUT** — les mentions de l'annexe XV.
--
-- `NULL` par colonne = non renseigné, jamais zéro. L'absence de LIGNE dit la
-- même chose que dans l'autre table : personne n'a rien saisi.
CREATE TABLE "pim"."nutrition_values" (
    "variant_id" TEXT NOT NULL,
    "energy_kcal" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "saturated_fat_g" DOUBLE PRECISION,
    "carbs_g" DOUBLE PRECISION,
    "sugars_g" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "salt_g" DOUBLE PRECISION,
    "glycemic_index" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_values_pkey" PRIMARY KEY ("variant_id")
);

-- `PK = FK` partagée : deux fiches pour une même déclinaison sont
-- structurellement impossibles, sans identifiant de substitution.
--
-- `CASCADE` : une déclinaison effacée n'a plus de fiche à porter. C'est le même
-- choix que `nutrition_declaration`, et il ne concerne que la suppression d'une
-- déclinaison — un geste qui n'existe pas au catalogue (on archive).
ALTER TABLE "pim"."variant_allergens"
  ADD CONSTRAINT "variant_allergens_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "pim"."product_variant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."nutrition_values"
  ADD CONSTRAINT "nutrition_values_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "pim"."product_variant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
