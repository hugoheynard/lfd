-- LES POSTES DU FOURNIL — `documentation/fournil/plan-postes-du-fournil.md`,
-- § 3.2, lot W1 (Hugo, 2026-11-16).
--
-- Le fournil s'organise en postes (boulangerie, tourier, pâtisserie…) et
-- range chaque PRODUIT au poste qui le fait ; ses déclinaisons en héritent.
-- La référence produit est opaque : aucune clé ne sort du schéma
-- `production`. Un poste s'archive (`archived_at`), il ne s'efface pas.
-- `grouping` choisit le rangement : `shelf` (mode boutique, le défaut, comme
-- aujourd'hui) ou `workstation` (mode prod).
--
-- Aucun droit accordé ici : `production_workstations` s'accorde à l'écran.
--
-- ADDITIVE. Retour arrière, sans perte de donnée servie :
--   DROP TABLE "production"."production_workstation_product";
--   DROP TABLE "production"."production_workstation";
--   ALTER TABLE "production"."production_display_settings"
--     DROP CONSTRAINT "production_display_settings_grouping",
--     DROP COLUMN "grouping";

SET lock_timeout = '5s';

CREATE TABLE "production"."production_workstation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT,

    CONSTRAINT "production_workstation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_workstation_name" CHECK (
        "name" = btrim("name") AND char_length("name") BETWEEN 1 AND 40
    )
);

-- Jamais deux postes en service du même nom, casse ignorée.
CREATE UNIQUE INDEX "production_workstation_live_name_key"
    ON "production"."production_workstation" (lower("name"))
    WHERE "archived_at" IS NULL;

CREATE TABLE "production"."production_workstation_product" (
    "product_sku" TEXT NOT NULL,
    "workstation_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT,

    CONSTRAINT "production_workstation_product_pkey" PRIMARY KEY ("product_sku"),
    CONSTRAINT "production_workstation_product_sku" CHECK (
        char_length("product_sku") BETWEEN 1 AND 64
    ),
    CONSTRAINT "production_workstation_product_workstation_id_fkey"
        FOREIGN KEY ("workstation_id")
        REFERENCES "production"."production_workstation"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "production_workstation_product_workstation_id_idx"
    ON "production"."production_workstation_product"("workstation_id");

ALTER TABLE "production"."production_display_settings"
    ADD COLUMN "grouping" TEXT NOT NULL DEFAULT 'shelf',
    ADD CONSTRAINT "production_display_settings_grouping"
        CHECK ("grouping" IN ('shelf', 'workstation'));
