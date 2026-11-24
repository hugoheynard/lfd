-- L'heure du réassort au fournil (plan documentation/reassort-boutiques/plan-heure-du-reassort.md, lot H3).
--
-- La copie figée d'un réassort au plan garde l'heure d'ARRIVÉE voulue au
-- point, `HH:MM`, recopiée à l'arrêt depuis ce que le commerce sert. Additive
-- et nullable : un réassort figé avant la colonne, un réassort envoyé sans
-- heure et un « au plus tôt » lancé n'en ont pas.

ALTER TABLE "production"."production_resupply" ADD COLUMN "arrival_by" VARCHAR(5);
ALTER TABLE "production"."production_resupply"
  ADD CONSTRAINT "production_resupply_arrival_by_clock" CHECK (
    "arrival_by" IS NULL OR "arrival_by" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );
