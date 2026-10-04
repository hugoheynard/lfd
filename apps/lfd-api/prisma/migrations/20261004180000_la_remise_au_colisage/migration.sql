-- LA REMISE AU COLISAGE — plan `documentation/colisage/plan-domaine-colisage.md`,
-- lot K1 (« étendre, en ombre »), §12 corrigé par §13.
--
-- ADDITIVE : deux colonnes neuves (dont une à défaut constant, sans réécriture
-- de table depuis Postgres 11), une table neuve et ses trois déclencheurs de
-- journal. Aucune ligne existante modifiée, aucun droit accordé à un rôle.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE "production"."production_handoff"`
-- (ses déclencheurs partent avec elle), puis `ALTER TABLE … DROP COLUMN` des
-- deux colonnes. Ne perd que l'ombre : aucune lecture ne décide sur elles en K1.

SET lock_timeout = '5s';

-- 1. Qui colise la journée (§13, B1) — écrit à la clôture ; K1 n'écrit que `legacy`.
ALTER TABLE "production"."production_day"
    ADD COLUMN "packing_owner" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "production"."production_day"
    ADD CONSTRAINT "production_day_packing_owner_check"
    CHECK ("packing_owner" IN ('legacy', 'packing'));

-- 2. L'échéance de la commande, `HH:mm` (§13, SÉRIEUX). Nulle pour toutes les
--    commandes inscrites avant : elles passent en dernier dans l'attribution.
ALTER TABLE "production"."production_order"
    ADD COLUMN "due_at" VARCHAR(5);

-- 3. Les remises au colisage (§10.3) — en ajout seul, quantité signée.
CREATE TABLE "production"."production_handoff" (
    "id"          TEXT         NOT NULL,
    "service_day" VARCHAR(10)  NOT NULL,
    "sku"         TEXT         NOT NULL,
    "quantity"    INTEGER      NOT NULL,
    "source"      TEXT         NOT NULL,
    "at"          TIMESTAMPTZ(6) NOT NULL,
    "by"          TEXT         NOT NULL,
    "request_id"  TEXT,

    CONSTRAINT "production_handoff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_handoff_quantity_check" CHECK ("quantity" <> 0),
    CONSTRAINT "production_handoff_source_check" CHECK ("source" IN ('batch')),
    -- Un retour (quantité négative) porte sa demande ; une remise n'en porte pas.
    CONSTRAINT "production_handoff_request_check"
        CHECK (("quantity" < 0) = ("request_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "production_handoff_request_id_key"
    ON "production"."production_handoff"("request_id");
CREATE INDEX "production_handoff_service_day_sku_idx"
    ON "production"."production_handoff"("service_day", "sku");

ALTER TABLE "production"."production_handoff"
    ADD CONSTRAINT "production_handoff_service_day_fkey"
    FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Le journal des journées (plan-version-par-journee.md, D7) : toute table du
--    schéma `production` qui porte une journée a ses trois déclencheurs, sur la
--    fonction du schéma — `test/day-change-triggers.e2e-spec.ts` le tient.
CREATE TRIGGER "production_handoff_day_change_insert"
  AFTER INSERT ON "production"."production_handoff"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_handoff_day_change_update"
  AFTER UPDATE ON "production"."production_handoff"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_handoff_day_change_delete"
  AFTER DELETE ON "production"."production_handoff"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
