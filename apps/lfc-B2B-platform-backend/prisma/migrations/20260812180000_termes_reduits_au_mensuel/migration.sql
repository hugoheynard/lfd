-- Un seul terme différé : le mensuel. 60 et 90 jours n'étaient adossés à aucune
-- mécanique (ni facture, ni échéance, ni prélèvement) : ils promettaient un
-- crédit que l'application ne savait pas recouvrer. On les retire du modèle
-- plutôt que de les laisser accordables.
--
-- Reprise : toute société qui en bénéficiait bascule au mensuel. On ne peut pas
-- « garder » un terme que plus rien ne sait honorer, et le laisser en base
-- laisserait une valeur d'enum morte que le prochain lecteur croirait vivante.

-- 1. Les demandes en cours sur un terme disparu deviennent des demandes de mensuel.
UPDATE "public"."companies"
   SET "requested_term" = 'monthly'
 WHERE "requested_term" IN ('net60', 'net90');

-- 2. Les termes ACCORDÉS : on remplace net60/net90 par monthly, sans doublon
--    (une société au mensuel + net60 ne doit pas se retrouver avec monthly ×2).
UPDATE "public"."companies"
   SET "granted_terms" = ARRAY['monthly']::"public"."DeferredTerm"[]
 WHERE 'net60' = ANY ("granted_terms") OR 'net90' = ANY ("granted_terms");

-- 3. L'enum perd ses deux valeurs. Postgres ne sait pas retirer une valeur d'un
--    type existant : on recrée le type et on rebranche les colonnes.
ALTER TYPE "public"."DeferredTerm" RENAME TO "DeferredTerm_old";
CREATE TYPE "public"."DeferredTerm" AS ENUM ('monthly');

ALTER TABLE "public"."companies"
  ALTER COLUMN "granted_terms" DROP DEFAULT,
  ALTER COLUMN "granted_terms" TYPE "public"."DeferredTerm"[]
    USING "granted_terms"::text[]::"public"."DeferredTerm"[],
  ALTER COLUMN "granted_terms" SET DEFAULT ARRAY[]::"public"."DeferredTerm"[],
  ALTER COLUMN "requested_term" TYPE "public"."DeferredTerm"
    USING "requested_term"::text::"public"."DeferredTerm";

DROP TYPE "public"."DeferredTerm_old";
