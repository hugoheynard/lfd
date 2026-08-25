-- La signature à la remise devient une exigence de la SOCIÉTÉ, que chaque
-- adresse peut redéfinir.
--
-- Purement additif : une colonne avec un défaut, et rien d'autre. La dérogation
-- par adresse vit déjà dans le `jsonb` `delivery_specs` — elle y devient
-- simplement FACULTATIVE (`null` = hérite), ce qui ne se déclare pas en SQL.
--
-- ⚠️ Les adresses existantes ne sont PAS remises à `null`. Elles portent toutes
-- `signatureRequired: false`, et ce `false` reste lu comme « on ne signe pas
-- ici » — la promesse d'aujourd'hui. Les basculer en « hérite » les ferait
-- changer de comportement le jour où un client relève son socle, sans que
-- personne ne l'ait demandé. Une adresse recommence à hériter quand quelqu'un
-- le décide à l'écran, jamais par migration.
ALTER TABLE "public"."companies"
  ADD COLUMN "delivery_signature_required" BOOLEAN NOT NULL DEFAULT false;
