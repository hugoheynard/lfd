-- Le jour du reliquat fait bouger la version de journée (D7,
-- `documentation/caching-usage/plan-version-par-journee.md`).
--
-- `delivery_note.service_day` est né avec le lot L1 du reliquat
-- (`20261026050000_le_jour_du_reliquat`) sans déclencheur : la garde D7
-- rougissait. Le rang 1 laisse ce jour NULL (il suit la commande, déjà
-- surveillée par `requested_delivery_date`) : la fonction n'écrit que les
-- jours posés, sans quoi elle insérerait un jour nul dans le journal.
--
-- ADDITIVE. Retour arrière :
--   DROP TRIGGER "delivery_note_day_change_insert" ON "public"."delivery_note";
--   DROP TRIGGER "delivery_note_day_change_update" ON "public"."delivery_note";
--   DROP TRIGGER "delivery_note_day_change_delete" ON "public"."delivery_note";
--   DROP FUNCTION "public"."record_day_change_by_remainder_day"();

CREATE OR REPLACE FUNCTION "public"."record_day_change_by_remainder_day"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "public"."day_change" ("service_day")
    SELECT DISTINCT to_char("service_day", 'YYYY-MM-DD') FROM new_rows
    WHERE "service_day" IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "public"."day_change" ("service_day")
    SELECT to_char("service_day", 'YYYY-MM-DD') FROM new_rows WHERE "service_day" IS NOT NULL
    UNION
    SELECT to_char("service_day", 'YYYY-MM-DD') FROM old_rows WHERE "service_day" IS NOT NULL;
  ELSE
    INSERT INTO "public"."day_change" ("service_day")
    SELECT DISTINCT to_char("service_day", 'YYYY-MM-DD') FROM old_rows
    WHERE "service_day" IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "delivery_note_day_change_insert"
  AFTER INSERT ON "public"."delivery_note"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_remainder_day"();
CREATE TRIGGER "delivery_note_day_change_update"
  AFTER UPDATE ON "public"."delivery_note"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_remainder_day"();
CREATE TRIGGER "delivery_note_day_change_delete"
  AFTER DELETE ON "public"."delivery_note"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_day_change_by_remainder_day"();
