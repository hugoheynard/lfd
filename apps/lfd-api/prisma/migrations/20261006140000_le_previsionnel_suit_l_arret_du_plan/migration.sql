-- LE PRÉVISIONNEL SUIT L'ARRÊT DU PLAN
--
-- Plan `documentation/production/plan-arret-du-plan.md`, §5, lot A3.
--
-- ADDITIVE : des déclencheurs de journal sur deux tables existantes, avec la
-- fonction déjà en place (`record_day_change_by_service_day`, migration
-- `20260928140000_la_version_par_journee`). Aucune ligne touchée, aucun droit
-- accordé.
--
-- L'état de chaque journée du prévisionnel lit désormais :
--   · `production_closed_day` — fermer ou rouvrir un jour change sa colonne ;
--   · `production_auto_close_attempt` — un arrêt automatique échoué ou en
--     suspens la fait passer en retard.
-- Sans déclencheur, l'écran ne se relirait pas à ces changements.
--
-- Retour arrière du SCHÉMA : `DROP TRIGGER` des six déclencheurs.

SET lock_timeout = '5s';

CREATE TRIGGER "production_closed_day_day_change_insert"
  AFTER INSERT ON "production"."production_closed_day"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_closed_day_day_change_update"
  AFTER UPDATE ON "production"."production_closed_day"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_closed_day_day_change_delete"
  AFTER DELETE ON "production"."production_closed_day"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "production_auto_close_attempt_day_change_insert"
  AFTER INSERT ON "production"."production_auto_close_attempt"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_auto_close_attempt_day_change_update"
  AFTER UPDATE ON "production"."production_auto_close_attempt"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_auto_close_attempt_day_change_delete"
  AFTER DELETE ON "production"."production_auto_close_attempt"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
