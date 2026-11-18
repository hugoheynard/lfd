-- Le numéro de tirage du dossier de production (décidé par Hugo le 2026-11-18) :
-- combien de fois la journée a été complétée depuis son dernier arrêt. Le
-- dossier imprime « v<retake_count + 1> » dans son en-tête.
--
-- Une colonne neuve, puis son report : les journées déjà complétées n'ont
-- pas gardé le compte de leurs retirages, elles valent 1 (« v2 »), le seul
-- nombre sûr. Rien n'est supprimé ni converti.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_day"
  ADD COLUMN "retake_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "production"."production_day"
  ADD CONSTRAINT "production_day_retake_count_check" CHECK ("retake_count" >= 0);

UPDATE "production"."production_day"
   SET "retake_count" = 1
 WHERE "retaken_at" IS NOT NULL;
