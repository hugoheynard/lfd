-- LES TYPES DE BACS ET LEURS CONTENANCES — `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 4 bis, v2-1 et v2-2, tranche A.
--
-- Purement ADDITIVE : deux tables neuves dans `production` (Q10), sans
-- journée (exceptions D7 écrites dans `test/day-change-triggers.e2e-spec.ts`),
-- sans client. Le SKU d'une contenance est OPAQUE : aucune clé vers le
-- référentiel ni vers le commerce.
--
-- Les CHECK tiennent en base ce que le domaine refuse déjà ; les bornes
-- (1–300 cm, pile 1–20, 1–10 000 unités) restent au domaine, qui les refuse
-- avec la phrase à lire.
--
-- Retour arrière : `DROP TABLE "production"."delivery_bin_capacity"` puis
-- `DROP TABLE "production"."delivery_bin_type"` — on y perd le catalogue des
-- bacs et la grille des contenances saisis.

CREATE TABLE "production"."delivery_bin_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outer_length_cm" INTEGER NOT NULL,
    "outer_width_cm" INTEGER NOT NULL,
    "outer_height_cm" INTEGER NOT NULL,
    "inner_length_cm" INTEGER NOT NULL,
    "inner_width_cm" INTEGER NOT NULL,
    "inner_height_cm" INTEGER NOT NULL,
    "isotherm" BOOLEAN NOT NULL,
    "max_stack" INTEGER NOT NULL,
    "divisible" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "delivery_bin_type_pkey" PRIMARY KEY ("id"),
    -- L'intérieur tient dans l'extérieur, dimension par dimension ; tout est positif.
    CONSTRAINT "delivery_bin_type_dimensions" CHECK (
        "inner_length_cm" > 0 AND "inner_width_cm" > 0 AND "inner_height_cm" > 0
        AND "inner_length_cm" <= "outer_length_cm"
        AND "inner_width_cm" <= "outer_width_cm"
        AND "inner_height_cm" <= "outer_height_cm"
    ),
    CONSTRAINT "delivery_bin_type_max_stack" CHECK ("max_stack" >= 1)
);

-- Deux types NON archivés ne portent pas le même nom ; un type archivé libère
-- le sien. Partiel, comme la plaque d'un véhicule en service : Prisma ne sait
-- pas l'exprimer, il n'apparaît pas dans le schéma.
CREATE UNIQUE INDEX "delivery_bin_type_active_name_key"
    ON "production"."delivery_bin_type"("name")
    WHERE "archived_at" IS NULL;

CREATE TABLE "production"."delivery_bin_capacity" (
    "bin_type_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_bin_capacity_pkey" PRIMARY KEY ("bin_type_id","sku"),
    CONSTRAINT "delivery_bin_capacity_units" CHECK ("units" >= 1)
);

ALTER TABLE "production"."delivery_bin_capacity"
    ADD CONSTRAINT "delivery_bin_capacity_bin_type_id_fkey"
    FOREIGN KEY ("bin_type_id") REFERENCES "production"."delivery_bin_type"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
