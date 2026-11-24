-- L'heure du réassort (plan documentation/reassort-boutiques/plan-heure-du-reassort.md, lot H1).
--
-- L'heure d'ARRIVÉE voulue au point, `HH:MM` (00:00–23:59), comme le créneau
-- d'une commande. Additive et nullable : les réassorts déjà envoyés restent
-- sans heure et gardent la règle d'avant. « Pour demain » sans heure est
-- refusé par l'agrégat (les lignes d'avant ne le permettent pas en base) ;
-- « au plus tôt » n'en porte jamais, ni sur un réassort, ni sur un brouillon
-- du fournil, ni sur un modèle : ça, la base le tient.

ALTER TABLE "public"."site_resupply" ADD COLUMN "arrival_by" VARCHAR(5);
ALTER TABLE "public"."site_resupply"
  ADD CONSTRAINT "site_resupply_arrival_by_clock" CHECK (
    "arrival_by" IS NULL OR "arrival_by" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );
ALTER TABLE "public"."site_resupply"
  ADD CONSTRAINT "site_resupply_arrival_by_not_asap" CHECK (
    "arrival_by" IS NULL OR "target" = 'tomorrow'
  );

ALTER TABLE "public"."bakehouse_resupply_drafts" ADD COLUMN "arrival_by" VARCHAR(5);
ALTER TABLE "public"."bakehouse_resupply_drafts"
  ADD CONSTRAINT "bakehouse_resupply_draft_arrival_by_clock" CHECK (
    "arrival_by" IS NULL OR "arrival_by" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );
ALTER TABLE "public"."bakehouse_resupply_drafts"
  ADD CONSTRAINT "bakehouse_resupply_draft_arrival_by_not_asap" CHECK (
    "arrival_by" IS NULL OR "target" = 'tomorrow'
  );

ALTER TABLE "public"."resupply_templates" ADD COLUMN "arrival_by" VARCHAR(5);
ALTER TABLE "public"."resupply_templates"
  ADD CONSTRAINT "resupply_template_arrival_by_clock" CHECK (
    "arrival_by" IS NULL OR "arrival_by" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );
ALTER TABLE "public"."resupply_templates"
  ADD CONSTRAINT "resupply_template_arrival_by_not_asap" CHECK (
    "arrival_by" IS NULL OR "target" = 'tomorrow'
  );
