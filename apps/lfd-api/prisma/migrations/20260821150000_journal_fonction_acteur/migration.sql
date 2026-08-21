-- La fonction de l'acteur, figée au moment de l'acte comme son nom.
--
-- Nullable, et le reste : les faits déjà écrits n'en ont pas, et l'écran sait
-- s'en passer. Aucune reprise — un journal ne se réécrit pas.
ALTER TABLE "growth"."activity_events" ADD COLUMN "actor_role" TEXT;
