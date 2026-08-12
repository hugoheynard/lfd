-- Le journal disait « un membre du staff » parce qu'il ne gardait que la NATURE
-- de l'acteur. On garde désormais qui : le `sub` (ou l'id client), et un
-- instantané du nom au moment de l'acte. Nuls pour l'existant — on ne réécrit
-- pas une histoire qu'on n'a pas enregistrée.
ALTER TABLE "growth"."activity_events"
  ADD COLUMN "actor_id"   TEXT,
  ADD COLUMN "actor_name" TEXT;
