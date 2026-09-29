-- LE CHARGEMENT D'UN VÉHICULE — `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 2 bis, L2b-C1 à C5.
--
-- Purement ADDITIVE : six colonnes NULLABLES sur `production.delivery_vehicle`.
-- Les véhicules existants restent tels quels : dimensions inconnues, sec.
--
-- Les CHECK tiennent en base ce que le domaine refuse déjà, pour qu'aucune
-- écriture hors de l'agrégat ne pose un véhicule à moitié décrit. Les bornes
-- (1–1 000 cm, 1–20 000 L, −30..+15 °C) et « réfrigéré ≤ utile » restent au
-- domaine, qui les refuse avec la phrase à lire.
--
-- Retour arrière : `ALTER TABLE "production"."delivery_vehicle" DROP CONSTRAINT …`
-- puis `DROP COLUMN …` pour les six — on y perd les dimensions et le froid saisis.

ALTER TABLE "production"."delivery_vehicle"
    ADD COLUMN "cargo_length_cm" INTEGER,
    ADD COLUMN "cargo_width_cm" INTEGER,
    ADD COLUMN "cargo_height_cm" INTEGER,
    ADD COLUMN "refrigerated_volume_liters" INTEGER,
    ADD COLUMN "refrigerated_min_temp_c" INTEGER,
    ADD COLUMN "refrigerated_max_temp_c" INTEGER;

-- Les trois dimensions, ou aucune.
ALTER TABLE "production"."delivery_vehicle"
    ADD CONSTRAINT "delivery_vehicle_cargo_all_or_none" CHECK (
        ("cargo_length_cm" IS NULL AND "cargo_width_cm" IS NULL AND "cargo_height_cm" IS NULL)
        OR ("cargo_length_cm" IS NOT NULL AND "cargo_width_cm" IS NOT NULL AND "cargo_height_cm" IS NOT NULL)
    );

-- Les trois champs du froid, ou aucun.
ALTER TABLE "production"."delivery_vehicle"
    ADD CONSTRAINT "delivery_vehicle_refrigeration_all_or_none" CHECK (
        ("refrigerated_volume_liters" IS NULL AND "refrigerated_min_temp_c" IS NULL AND "refrigerated_max_temp_c" IS NULL)
        OR ("refrigerated_volume_liters" IS NOT NULL AND "refrigerated_min_temp_c" IS NOT NULL AND "refrigerated_max_temp_c" IS NOT NULL)
    );

-- La plage de température n'est pas à l'envers. Deux NULL passent : c'est
-- l'autre CHECK qui dit « tout ou rien ».
ALTER TABLE "production"."delivery_vehicle"
    ADD CONSTRAINT "delivery_vehicle_refrigeration_range" CHECK (
        "refrigerated_min_temp_c" IS NULL
        OR "refrigerated_max_temp_c" IS NULL
        OR "refrigerated_min_temp_c" <= "refrigerated_max_temp_c"
    );
