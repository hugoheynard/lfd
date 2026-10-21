-- Le réassort fait bouger la version de journée (D7,
-- `documentation/caching-usage/plan-version-par-journee.md`).
--
-- Les tables du réassort (R1–R3) sont arrivées sans déclencheur de journal :
-- la garde D7 rougissait, et l'onglet Stock de la Supervision (S1) ne se
-- relisait pas quand un réassort bougeait. Additive : des fonctions et des
-- déclencheurs neufs, la forme de `20260928140000_la_version_par_journee`.

-- ─── Le commerce : `site_resupply`, `resupply_receipt` (service_day DATE) ───
-- Les lignes (`site_resupply_line`, `resupply_receipt_line`) ne portent pas de
-- jour : D7 ne les surveille pas, et l'en-tête s'écrit avec elles.
CREATE OR REPLACE FUNCTION "public"."record_day_change_by_service_day"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "public"."day_change" ("service_day")
    SELECT DISTINCT to_char("service_day", 'YYYY-MM-DD') FROM new_rows;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "public"."day_change" ("service_day")
    SELECT to_char("service_day", 'YYYY-MM-DD') FROM new_rows
    UNION
    SELECT to_char("service_day", 'YYYY-MM-DD') FROM old_rows;
  ELSE
    INSERT INTO "public"."day_change" ("service_day")
    SELECT DISTINCT to_char("service_day", 'YYYY-MM-DD') FROM old_rows;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "site_resupply_day_change_insert"
  AFTER INSERT ON "public"."site_resupply"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_service_day"();
CREATE TRIGGER "site_resupply_day_change_update"
  AFTER UPDATE ON "public"."site_resupply"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_service_day"();
CREATE TRIGGER "site_resupply_day_change_delete"
  AFTER DELETE ON "public"."site_resupply"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_service_day"();
CREATE TRIGGER "resupply_receipt_day_change_insert"
  AFTER INSERT ON "public"."resupply_receipt"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_service_day"();
CREATE TRIGGER "resupply_receipt_day_change_update"
  AFTER UPDATE ON "public"."resupply_receipt"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_service_day"();
CREATE TRIGGER "resupply_receipt_day_change_delete"
  AFTER DELETE ON "public"."resupply_receipt"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_service_day"();

-- ─── Le fournil : le réassort au plan figé ─────────────────────────────────
-- La ligne lit son jour par son en-tête (`production_resupply_id`), comme une
-- ligne de commande de production lit le sien.
CREATE OR REPLACE FUNCTION "production"."record_day_change_by_production_resupply"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT r."service_day"
      FROM new_rows l JOIN "production"."production_resupply" r ON r."id" = l."production_resupply_id";
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT r."service_day"
      FROM new_rows l JOIN "production"."production_resupply" r ON r."id" = l."production_resupply_id"
    UNION
    SELECT r."service_day"
      FROM old_rows l JOIN "production"."production_resupply" r ON r."id" = l."production_resupply_id";
  ELSE
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT r."service_day"
      FROM old_rows l JOIN "production"."production_resupply" r ON r."id" = l."production_resupply_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "production_resupply_day_change_insert"
  AFTER INSERT ON "production"."production_resupply"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_resupply_day_change_update"
  AFTER UPDATE ON "production"."production_resupply"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_resupply_day_change_delete"
  AFTER DELETE ON "production"."production_resupply"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_resupply_line_day_change_insert"
  AFTER INSERT ON "production"."production_resupply_line"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_production_resupply"();
CREATE TRIGGER "production_resupply_line_day_change_update"
  AFTER UPDATE ON "production"."production_resupply_line"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_production_resupply"();
CREATE TRIGGER "production_resupply_line_day_change_delete"
  AFTER DELETE ON "production"."production_resupply_line"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_production_resupply"();

-- ─── Le colisage : en-tête et lignes portent leur `service_day` ─────────────
CREATE TRIGGER "packing_resupply_day_change_insert"
  AFTER INSERT ON "packing"."packing_resupply"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_resupply_day_change_update"
  AFTER UPDATE ON "packing"."packing_resupply"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_resupply_day_change_delete"
  AFTER DELETE ON "packing"."packing_resupply"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_resupply_line_day_change_insert"
  AFTER INSERT ON "packing"."packing_resupply_line"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_resupply_line_day_change_update"
  AFTER UPDATE ON "packing"."packing_resupply_line"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
CREATE TRIGGER "packing_resupply_line_day_change_delete"
  AFTER DELETE ON "packing"."packing_resupply_line"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "packing"."record_day_change_by_service_day"();
