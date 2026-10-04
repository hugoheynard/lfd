-- LA BASCULE DU COLISAGE — plan `documentation/colisage/plan-domaine-colisage.md`,
-- lot K2 (« basculer »), §12 corrigé par §13, §15.
--
-- ADDITIVE : deux tables neuves (une par schéma), un journal de journée pour le
-- schéma `packing`, sa fonction et ses déclencheurs. Aucune ligne existante
-- modifiée, aucune colonne resserrée, aucun droit accordé à un rôle.
--
-- 🔴 Le BINAIRE qui accompagne cette migration est irréversible pour chaque
-- journée qu'il arrête (`packing_owner = 'packing'`) — la migration, elle, ne
-- l'est pas. Retour arrière du SCHÉMA (migration EN AVANT) : `DROP TABLE` des
-- deux tables, `DROP TABLE "packing"."day_change"` et `DROP FUNCTION
-- "packing"."record_day_change_by_service_day"()` (les déclencheurs partent
-- avec leurs tables pour les deux neuves ; `DROP TRIGGER` pour les quatre de K1).
-- Ne le faire qu'une fois aucune journée `packing` en cours (§15).

SET lock_timeout = '5s';

-- 1. Les demandes de retour du fournil sur une journée `packing` (§13, B2).
--    Une ligne par demande ; la réponse du colisage (`packing.returned`) la
--    clôt. Tant qu'elle n'a pas de réponse, la fiche dit « retour en attente »,
--    et « sorti » ne baisse pas.
CREATE TABLE "production"."production_return_request" (
    "request_id"   TEXT           NOT NULL,
    "service_day"  VARCHAR(10)    NOT NULL,
    "batch_id"     TEXT           NOT NULL,
    "sku"          TEXT           NOT NULL,
    "quantity"     INTEGER        NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "requested_by" TEXT           NOT NULL,
    "answered_at"  TIMESTAMPTZ(6),
    "returned"     INTEGER,

    CONSTRAINT "production_return_request_pkey" PRIMARY KEY ("request_id"),
    CONSTRAINT "production_return_request_quantity_check" CHECK ("quantity" > 0),
    -- Une réponse porte son instant ET sa quantité, entre zéro et la demande.
    CONSTRAINT "production_return_request_answer_check" CHECK (
        ("answered_at" IS NULL) = ("returned" IS NULL)
        AND ("returned" IS NULL OR ("returned" >= 0 AND "returned" <= "quantity"))
    )
);

CREATE INDEX "production_return_request_service_day_batch_id_idx"
    ON "production"."production_return_request"("service_day", "batch_id");

ALTER TABLE "production"."production_return_request"
    ADD CONSTRAINT "production_return_request_service_day_fkey"
    FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "production_return_request_day_change_insert"
  AFTER INSERT ON "production"."production_return_request"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_return_request_day_change_update"
  AFTER UPDATE ON "production"."production_return_request"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_return_request_day_change_delete"
  AFTER DELETE ON "production"."production_return_request"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

-- 2. Les demandes de retour reçues par le colisage (§13, B2, MINEURS). Une
--    demande dont la remise n'est pas encore arrivée (« remise inconnue »)
--    attend ici, sans réponse ; elle est tranchée à l'arrivée de la remise.
CREATE TABLE "packing"."packing_return" (
    "request_id"  TEXT           NOT NULL,
    "service_day" VARCHAR(10)    NOT NULL,
    "sku"         TEXT           NOT NULL,
    "handoff_id"  TEXT           NOT NULL,
    "requested"   INTEGER        NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at"  TIMESTAMPTZ(6),
    "returned"    INTEGER,

    CONSTRAINT "packing_return_pkey" PRIMARY KEY ("request_id"),
    CONSTRAINT "packing_return_requested_check" CHECK ("requested" > 0),
    CONSTRAINT "packing_return_decision_check" CHECK (
        ("decided_at" IS NULL) = ("returned" IS NULL)
        AND ("returned" IS NULL OR ("returned" >= 0 AND "returned" <= "requested"))
    )
);

CREATE INDEX "packing_return_handoff_id_idx" ON "packing"."packing_return"("handoff_id");

-- 3. Le journal des journées du colisage (§10.3, §14) : son PROPRE journal,
--    dans son schéma (plan-version-par-journee, D3) — aucune fonction ne lit
--    ni n'écrit hors de `packing`.
CREATE TABLE "packing"."day_change" (
    "id"          BIGSERIAL    NOT NULL,
    "service_day" VARCHAR(10)  NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "day_change_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "day_change_service_day_id_idx"
    ON "packing"."day_change"("service_day", "id");

CREATE OR REPLACE FUNCTION "packing"."record_day_change_by_service_day"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "packing"."day_change" ("service_day")
    SELECT DISTINCT "service_day" FROM new_rows;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "packing"."day_change" ("service_day")
    SELECT "service_day" FROM new_rows
    UNION
    SELECT "service_day" FROM old_rows;
  ELSE
    INSERT INTO "packing"."day_change" ("service_day")
    SELECT DISTINCT "service_day" FROM old_rows;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "packing_order_day_change_insert" AFTER INSERT ON "packing"."packing_order"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_order_day_change_update" AFTER UPDATE ON "packing"."packing_order"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_order_day_change_delete" AFTER DELETE ON "packing"."packing_order"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();

CREATE TRIGGER "packing_line_day_change_insert" AFTER INSERT ON "packing"."packing_line"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_line_day_change_update" AFTER UPDATE ON "packing"."packing_line"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_line_day_change_delete" AFTER DELETE ON "packing"."packing_line"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();

CREATE TRIGGER "packing_stock_day_change_insert" AFTER INSERT ON "packing"."packing_stock"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_stock_day_change_update" AFTER UPDATE ON "packing"."packing_stock"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_stock_day_change_delete" AFTER DELETE ON "packing"."packing_stock"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();

CREATE TRIGGER "packing_receipt_day_change_insert" AFTER INSERT ON "packing"."packing_receipt"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_receipt_day_change_update" AFTER UPDATE ON "packing"."packing_receipt"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_receipt_day_change_delete" AFTER DELETE ON "packing"."packing_receipt"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();

CREATE TRIGGER "packing_return_day_change_insert" AFTER INSERT ON "packing"."packing_return"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_return_day_change_update" AFTER UPDATE ON "packing"."packing_return"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_return_day_change_delete" AFTER DELETE ON "packing"."packing_return"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
