-- L'archive des référentiels (documentation/pim/plan-referentiel-a-neuf.md, L4).
--
-- Additive : une colonne nullable par table, sans défaut ni réécriture.
-- `NULL` = en service, comme avant. Le code d'avant ignore la colonne.
--
-- Taux de TVA, contexte de vente, ingrédient, appellation et limite horaire ne
-- se suppriment plus : ils s'archivent. Les clés étrangères en `RESTRICT`
-- restent posées ; elles ne servent plus qu'au filet.

ALTER TABLE "pim"."tva_rate" ADD COLUMN "archived_at" TIMESTAMPTZ;
ALTER TABLE "pim"."sales_context" ADD COLUMN "archived_at" TIMESTAMPTZ;
ALTER TABLE "pim"."ingredient" ADD COLUMN "archived_at" TIMESTAMPTZ;
ALTER TABLE "pim"."appellation" ADD COLUMN "archived_at" TIMESTAMPTZ;
ALTER TABLE "pim"."order_time_limit" ADD COLUMN "archived_at" TIMESTAMPTZ;
