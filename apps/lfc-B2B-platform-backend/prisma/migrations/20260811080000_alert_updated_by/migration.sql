-- Qui a écrit ce réglage / cette dérogation. Nullable : les lignes existantes
-- ont été écrites avant qu'on sache le dire, et prétendre le contraire serait
-- pire que l'avouer.
ALTER TABLE "alert_rule_settings" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "account_alert_overrides" ADD COLUMN "updated_by" TEXT;
