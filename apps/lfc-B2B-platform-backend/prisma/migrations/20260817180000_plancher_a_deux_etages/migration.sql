-- Le plancher devient un MUR et une PORTE.
--
-- Le mur (`mode`/`value`) existait déjà : les colonnes ajoutées ici décrivent la
-- porte — un plancher plus bas, que le volume déverrouille. Toutes nullables :
-- un plancher sans porte est le cas courant, et le rester ne demande rien.
ALTER TABLE "price_floors"
    ADD COLUMN "dynamic_mode"               TEXT,
    ADD COLUMN "dynamic_value"              INTEGER,
    ADD COLUMN "unlock_min_quantity"        INTEGER,
    ADD COLUMN "unlock_min_volume_ratio_bp" INTEGER;

-- Une porte sans plancher, ou un plancher de porte sans mode, n'a aucune
-- lecture. La contrainte tient ce que l'agrégat tient déjà — mais elle le tient
-- aussi contre un import, un seed ou une migration, qui ne passent pas par lui.
ALTER TABLE "price_floors"
    ADD CONSTRAINT "price_floors_dynamic_is_whole"
    CHECK (("dynamic_mode" IS NULL) = ("dynamic_value" IS NULL));

-- Une porte sans clé serait un mur plus bas : le plancher dur ne servirait plus
-- à rien, et personne ne verrait qu'il a été contourné.
ALTER TABLE "price_floors"
    ADD CONSTRAINT "price_floors_dynamic_needs_a_key"
    CHECK (
        "dynamic_mode" IS NULL
        OR "unlock_min_quantity" IS NOT NULL
        OR "unlock_min_volume_ratio_bp" IS NOT NULL
    );
