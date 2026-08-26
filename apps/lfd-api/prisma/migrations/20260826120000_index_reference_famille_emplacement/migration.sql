-- L'index de référence entre une famille et les emplacements que sa grille de
-- canaux cite. Une clé étrangère ne se pose pas dans du `jsonb` ; ce registre
-- la porte à sa place, sur le modèle de `sku_registry`.
--
-- AVANT D'APPLIQUER, repérer les références déjà pendantes — une grille qui
-- cite un emplacement supprimé. Le remplissage ci-dessous ÉCHOUERA sur elles,
-- et c'est le bon comportement : la corruption existe déjà, la migration la
-- révèle au lieu de la recopier.
--
--   SELECT c.id AS category_id, ref.key AS location_id
--   FROM pim.category c,
--        LATERAL jsonb_each(COALESCE(c.channel_preset -> 'boutiques', '{}'::jsonb)) ref
--   WHERE NOT EXISTS (SELECT 1 FROM pim.emplacement e WHERE e.id = ref.key);

CREATE TABLE "pim"."category_location_ref" (
    "category_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    CONSTRAINT "category_location_ref_pkey" PRIMARY KEY ("category_id", "location_id")
);

CREATE INDEX "category_location_ref_location_id_idx"
    ON "pim"."category_location_ref" ("location_id");

ALTER TABLE "pim"."category_location_ref"
    ADD CONSTRAINT "category_location_ref_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "pim"."category" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Le mur : un emplacement cité par une famille ne se supprime pas sous elle.
ALTER TABLE "pim"."category_location_ref"
    ADD CONSTRAINT "category_location_ref_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "pim"."emplacement" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remplissage depuis la source : les clés de `channel_preset -> boutiques`.
INSERT INTO "pim"."category_location_ref" ("category_id", "location_id")
SELECT c."id", ref.key
FROM "pim"."category" c,
     LATERAL jsonb_each(COALESCE(c."channel_preset" -> 'boutiques', '{}'::jsonb)) ref
ON CONFLICT DO NOTHING;
