-- LA BIBLIOTHÈQUE D'ACHAT — `documentation/livraisons/plan-bibliotheque-d-achat.md`,
-- B-D1 et B-D3, lot B1.
--
-- Purement ADDITIVE : deux tables neuves dans `production` (Q10 du plan de
-- tournée), sans journée (exceptions D7 écrites dans
-- `test/day-change-triggers.e2e-spec.ts`), sans client, sans clé étrangère.
-- SÉPARÉES de `delivery_vehicle` et de `delivery_bin_type` : un candidat n'est
-- lu par aucun adaptateur de la flotte ni du colisage.
--
-- Les CHECK tiennent en base ce que le domaine refuse déjà ; les bornes
-- (dimensions, pile, prix maximal, forme du lien) restent au domaine, qui les
-- refuse avec la phrase à lire.
--
-- Retour arrière : `DROP TABLE "production"."delivery_purchase_bin_candidate"`
-- puis `DROP TABLE "production"."delivery_purchase_vehicle_candidate"` — on y
-- perd les candidats saisis, qui ne sont cités par rien d'autre.

CREATE TABLE "production"."delivery_purchase_vehicle_candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cargo_length_cm" INTEGER NOT NULL,
    "cargo_width_cm" INTEGER NOT NULL,
    "cargo_height_cm" INTEGER NOT NULL,
    "wheel_arch_length_cm" INTEGER,
    "wheel_arch_protrusion_cm" INTEGER,
    "wheel_arch_from_back_cm" INTEGER,
    "wheel_arch_height_cm" INTEGER,
    "reference" TEXT,
    "purchase_url" TEXT,
    "price_cents_excl_vat" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "delivery_purchase_vehicle_candidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_purchase_vehicle_candidate_cargo" CHECK (
        "cargo_length_cm" > 0 AND "cargo_width_cm" > 0 AND "cargo_height_cm" > 0
    ),
    -- Les quatre cotes des passages de roue, ou aucune.
    CONSTRAINT "delivery_purchase_vehicle_candidate_wheel_arches_all_or_none" CHECK (
        ("wheel_arch_length_cm" IS NULL AND "wheel_arch_protrusion_cm" IS NULL
            AND "wheel_arch_from_back_cm" IS NULL AND "wheel_arch_height_cm" IS NULL)
        OR ("wheel_arch_length_cm" IS NOT NULL AND "wheel_arch_protrusion_cm" IS NOT NULL
            AND "wheel_arch_from_back_cm" IS NOT NULL AND "wheel_arch_height_cm" IS NOT NULL)
    ),
    -- Un prix HT en centimes entiers, jamais négatif ; NULL = inconnu, jamais zéro.
    CONSTRAINT "delivery_purchase_vehicle_candidate_price" CHECK (
        "price_cents_excl_vat" IS NULL OR "price_cents_excl_vat" >= 0
    )
);

-- Deux candidats NON archivés ne portent pas le même nom ; un candidat archivé
-- libère le sien. Partiel, comme un type de bac : Prisma ne sait pas
-- l'exprimer, il n'apparaît pas dans le schéma.
CREATE UNIQUE INDEX "delivery_purchase_vehicle_candidate_active_name_key"
    ON "production"."delivery_purchase_vehicle_candidate"("name")
    WHERE "archived_at" IS NULL;

CREATE TABLE "production"."delivery_purchase_bin_candidate" (
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
    "supplier" TEXT,
    "reference" TEXT,
    "purchase_url" TEXT,
    "unit_price_cents_excl_vat" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "delivery_purchase_bin_candidate_pkey" PRIMARY KEY ("id"),
    -- L'intérieur tient dans l'extérieur, dimension par dimension ; tout est positif.
    CONSTRAINT "delivery_purchase_bin_candidate_dimensions" CHECK (
        "inner_length_cm" > 0 AND "inner_width_cm" > 0 AND "inner_height_cm" > 0
        AND "inner_length_cm" <= "outer_length_cm"
        AND "inner_width_cm" <= "outer_width_cm"
        AND "inner_height_cm" <= "outer_height_cm"
    ),
    CONSTRAINT "delivery_purchase_bin_candidate_max_stack" CHECK ("max_stack" >= 1),
    CONSTRAINT "delivery_purchase_bin_candidate_price" CHECK (
        "unit_price_cents_excl_vat" IS NULL OR "unit_price_cents_excl_vat" >= 0
    )
);

CREATE UNIQUE INDEX "delivery_purchase_bin_candidate_active_name_key"
    ON "production"."delivery_purchase_bin_candidate"("name")
    WHERE "archived_at" IS NULL;
