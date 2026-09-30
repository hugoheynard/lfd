-- LES PASSAGES DE ROUE D'UN VÉHICULE — `documentation/livraisons/plan-geometrie-du-plancher.md`,
-- G-D2 et G-D5, lot G4.
--
-- Purement ADDITIVE : quatre colonnes NULLABLES sur `production.delivery_vehicle`.
-- Les véhicules existants restent tels quels : sans passages, leur plancher se
-- lit comme un rectangle.
--
-- Les CHECK tiennent en base ce que le domaine refuse déjà, pour qu'aucune
-- écriture hors de l'agrégat ne pose des passages à moitié décrits, ou posés
-- sur un véhicule dont on ne connaît pas le plancher. Les bornes, « saillie <
-- demi-largeur », « le passage tient dans la longueur » et « le passage est
-- plus bas que le plafond » restent au domaine (`CargoFloor`), qui les refuse
-- avec la phrase à lire.
--
-- La HAUTEUR du passage compte : des bacs s'empilent par-dessus, portés par
-- la colonne centrale (Hugo, 2026-09-30).
--
-- Retour arrière : `ALTER TABLE "production"."delivery_vehicle" DROP CONSTRAINT …`
-- puis `DROP COLUMN …` pour les quatre — on y perd les passages saisis.

ALTER TABLE "production"."delivery_vehicle"
    ADD COLUMN "wheel_arch_length_cm" INTEGER,
    ADD COLUMN "wheel_arch_protrusion_cm" INTEGER,
    ADD COLUMN "wheel_arch_from_back_cm" INTEGER,
    ADD COLUMN "wheel_arch_height_cm" INTEGER;

-- Les quatre cotes, ou aucune.
ALTER TABLE "production"."delivery_vehicle"
    ADD CONSTRAINT "delivery_vehicle_wheel_arches_all_or_none" CHECK (
        ("wheel_arch_length_cm" IS NULL AND "wheel_arch_protrusion_cm" IS NULL
            AND "wheel_arch_from_back_cm" IS NULL AND "wheel_arch_height_cm" IS NULL)
        OR ("wheel_arch_length_cm" IS NOT NULL AND "wheel_arch_protrusion_cm" IS NOT NULL
            AND "wheel_arch_from_back_cm" IS NOT NULL AND "wheel_arch_height_cm" IS NOT NULL)
    );

-- Des passages n'existent que sur un plancher connu. Une colonne du chargement
-- suffit : l'autre CHECK dit déjà « les trois ou aucune ».
ALTER TABLE "production"."delivery_vehicle"
    ADD CONSTRAINT "delivery_vehicle_wheel_arches_need_cargo" CHECK (
        "wheel_arch_length_cm" IS NULL OR "cargo_length_cm" IS NOT NULL
    );
