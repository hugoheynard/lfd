-- Un produit sur plusieurs postes (documentation/fournil/plan-produit-sur-plusieurs-postes.md,
-- § 2.2, § 2.3, § 2.6). La clé de la carte passe du produit au couple
-- (produit, poste) ; un seul poste par produit « finit ».
--
-- Aucune ligne existante ne viole la clé élargie : chacune devient la seule
-- ligne de son produit, et elle finit.
--
-- Retour arrière, tant qu'aucun produit n'a deux postes (sans perte) :
--   DROP TABLE "production"."production_line_step";
--   DROP INDEX "production"."production_workstation_product_one_finisher";
--   ALTER TABLE "production"."production_workstation_product"
--     DROP CONSTRAINT "production_workstation_product_pkey",
--     ADD PRIMARY KEY ("product_sku"),
--     DROP COLUMN "finishes";
-- Dès le premier produit à deux postes, il faudrait supprimer des lignes :
-- pas sans ordre de Hugo (CLAUDE.md § 0).

SET lock_timeout = '5s';

-- 1. Le poste qui finit
ALTER TABLE "production"."production_workstation_product"
    ADD COLUMN "finishes" BOOLEAN NOT NULL DEFAULT true;

-- 2. La clé (produit, poste)
ALTER TABLE "production"."production_workstation_product"
    DROP CONSTRAINT "production_workstation_product_pkey",
    ADD CONSTRAINT "production_workstation_product_pkey" PRIMARY KEY ("product_sku", "workstation_id");

-- 3. Au plus un poste qui finit par produit (« au moins un » : l'agrégat)
CREATE UNIQUE INDEX "production_workstation_product_one_finisher"
    ON "production"."production_workstation_product"("product_sku")
    WHERE "finishes";

-- 4. Le code dit toujours qui finit
ALTER TABLE "production"."production_workstation_product"
    ALTER COLUMN "finishes" DROP DEFAULT;

-- 5. L'étape d'un poste qui ne finit pas
CREATE TABLE "production"."production_line_step" (
    "service_day" VARCHAR(10) NOT NULL,
    "sku" TEXT NOT NULL,
    "workstation_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "checked_by_staff_id" TEXT NOT NULL,
    "checked_by_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "production_line_step_pkey" PRIMARY KEY ("service_day", "sku", "workstation_id"),
    CONSTRAINT "production_line_step_status" CHECK ("status" IN ('done', 'red')),
    CONSTRAINT "production_line_step_reason" CHECK (
        "reason" IS NULL OR ("reason" = btrim("reason") AND char_length("reason") BETWEEN 1 AND 500)
    ),
    CONSTRAINT "production_line_step_version" CHECK ("version" >= 1),
    CONSTRAINT "production_line_step_service_day_fkey"
        FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- La fiche d'atelier est gardée sur les journaux de la journée : une étape
-- cochée sans déclencheur laisserait servir la fiche d'avant.
CREATE TRIGGER "production_line_step_day_change_insert"
  AFTER INSERT ON "production"."production_line_step"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_line_step_day_change_update"
  AFTER UPDATE ON "production"."production_line_step"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_line_step_day_change_delete"
  AFTER DELETE ON "production"."production_line_step"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
