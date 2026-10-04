-- LES CONTENANTS AU COLISAGE — plan `documentation/colisage/plan-les-bacs-au-colisage.md`,
-- lot K2b, §5 (v2) corrigé par §5.1 (v2.1).
--
-- ADDITIVE : une colonne à défaut sur `packing_order`, deux tables neuves et
-- leurs déclencheurs `day_change`. Aucune ligne existante modifiée (le défaut
-- `counted` garde l'ancien écran aux commandes déjà inscrites), aucune colonne
-- resserrée, aucun droit accordé à un rôle.
--
-- Le colisage tient le CONTENU ; la livraison garde le BAC (`delivery.delivery_bin`).
-- Un contenant `bin` porte l'identifiant OPAQUE du bac, sans clé étrangère :
-- les schémas ne se joignent pas (§5.1). Le code et la moitié sont un
-- instantané, pris à la déclaration — ils ne changent jamais chez la livraison.
--
-- Retour arrière du SCHÉMA (migration EN AVANT) : `DROP TABLE` des deux tables
-- (leurs déclencheurs partent avec elles), puis `ALTER TABLE
-- "packing"."packing_order" DROP COLUMN "container_mode"` — une fois qu'aucun
-- binaire ne les lit.

SET lock_timeout = '5s';

-- 1. Le mode de la commande : `counted` (l'ancien compte de contenants) ou
--    `listed` (la colonne Contenants). `listed` est posé à l'inscription de la
--    liste à coliser par le binaire de K2b ; les commandes déjà inscrites
--    restent `counted`.
ALTER TABLE "packing"."packing_order"
    ADD COLUMN "container_mode" VARCHAR(8) NOT NULL DEFAULT 'counted',
    ADD CONSTRAINT "packing_order_container_mode_check"
        CHECK ("container_mode" IN ('counted', 'listed'));

-- 2. Un contenant d'une commande : un bac (déclaré par la livraison) ou un sac.
--    Jamais supprimé : un contenant annulé porte `voided_at`.
CREATE TABLE "packing"."container" (
    "id"          TEXT         NOT NULL,
    "service_day" VARCHAR(10)  NOT NULL,
    "order_id"    TEXT         NOT NULL,
    "nature"      VARCHAR(4)   NOT NULL,
    "bin_id"      TEXT,
    "bin_code"    VARCHAR(6),
    "bin_half"    VARCHAR(5),
    "opened_at"   TIMESTAMPTZ(6) NOT NULL,
    "opened_by"   TEXT         NOT NULL,
    "voided_at"   TIMESTAMPTZ(6),
    "voided_by"   TEXT,

    CONSTRAINT "container_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "container_nature_check" CHECK ("nature" IN ('bin', 'bag')),
    CONSTRAINT "container_bin_check" CHECK (
        ("nature" = 'bin') = ("bin_id" IS NOT NULL)
        AND ("bin_id" IS NULL) = ("bin_code" IS NULL)
    ),
    CONSTRAINT "container_bin_half_check" CHECK ("bin_half" IS NULL OR "bin_half" IN ('left', 'right')),
    CONSTRAINT "container_voided_check" CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL))
);

CREATE INDEX "container_service_day_order_id_idx"
    ON "packing"."container"("service_day", "order_id");
CREATE UNIQUE INDEX "container_bin_id_key" ON "packing"."container"("bin_id");

ALTER TABLE "packing"."container"
    ADD CONSTRAINT "container_service_day_order_id_fkey"
    FOREIGN KEY ("service_day", "order_id")
    REFERENCES "packing"."packing_order"("service_day", "order_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Ce qu'un contenant porte : un SKU, une quantité. Une ligne de commande se
--    coupe entre plusieurs contenants ; « au bac » = la somme des contenants
--    non annulés. Une quantité retirée à zéro reste une ligne à zéro.
CREATE TABLE "packing"."container_line" (
    "container_id" TEXT        NOT NULL,
    "service_day"  VARCHAR(10) NOT NULL,
    "sku"          TEXT        NOT NULL,
    "quantity"     INTEGER     NOT NULL,

    CONSTRAINT "container_line_pkey" PRIMARY KEY ("container_id", "sku"),
    CONSTRAINT "container_line_quantity_check" CHECK ("quantity" >= 0)
);

ALTER TABLE "packing"."container_line"
    ADD CONSTRAINT "container_line_container_id_fkey"
    FOREIGN KEY ("container_id") REFERENCES "packing"."container"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Le journal de la journée : la version du poste bouge avec ses contenants.
CREATE TRIGGER "container_day_change_insert" AFTER INSERT ON "packing"."container"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "container_day_change_update" AFTER UPDATE ON "packing"."container"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "container_day_change_delete" AFTER DELETE ON "packing"."container"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();

CREATE TRIGGER "container_line_day_change_insert" AFTER INSERT ON "packing"."container_line"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "container_line_day_change_update" AFTER UPDATE ON "packing"."container_line"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "container_line_day_change_delete" AFTER DELETE ON "packing"."container_line"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
