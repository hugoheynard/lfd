-- Postgres traite chaque NULL comme distinct : le `@@unique([pickup_address_id,
-- weekday])` de Prisma laisse donc passer DEUX règles « défaut plateforme, tous
-- jours ». La résolution dépendrait alors de l'ordre de lecture — c'est-à-dire
-- de rien. Trois index partiels couvrent les combinaisons que l'unique rate.

-- Une seule règle « défaut plateforme, tous les jours ».
CREATE UNIQUE INDEX "order_cutoffs_default_all_days"
  ON "public"."order_cutoffs" ((1))
  WHERE "pickup_address_id" IS NULL AND "weekday" IS NULL;

-- Une seule règle « défaut plateforme » par jour de semaine.
CREATE UNIQUE INDEX "order_cutoffs_default_by_weekday"
  ON "public"."order_cutoffs" ("weekday")
  WHERE "pickup_address_id" IS NULL AND "weekday" IS NOT NULL;

-- Une seule règle « tous les jours » par point de retrait.
CREATE UNIQUE INDEX "order_cutoffs_point_all_days"
  ON "public"."order_cutoffs" ("pickup_address_id")
  WHERE "pickup_address_id" IS NOT NULL AND "weekday" IS NULL;
