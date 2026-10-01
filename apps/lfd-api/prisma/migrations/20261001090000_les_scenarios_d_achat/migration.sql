-- LES SCÉNARIOS D'ACHAT — `documentation/livraisons/plan-bibliotheque-d-achat.md`,
-- B-D5, lot B3.
--
-- Purement ADDITIVE : une table neuve dans le schéma `delivery`, sans journée
-- (exception D7 écrite dans `test/day-change-triggers.e2e-spec.ts`), sans
-- client, sans clé étrangère — un scénario cite des identifiants, et un
-- élément archivé ou disparu se nomme à la relecture.
--
-- Retour arrière : `DROP TABLE "delivery"."delivery_purchase_scenario"` — ce
-- qu'on y perd n'est que des sélections d'essai, sans aucune donnée d'argent.

CREATE TABLE "delivery"."delivery_purchase_scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "delivery_purchase_scenario_pkey" PRIMARY KEY ("id")
);

-- Deux scénarios NON archivés ne portent pas le même nom ; un scénario archivé
-- libère le sien. Partiel : Prisma ne sait pas l'exprimer, il n'apparaît pas
-- dans le schéma.
CREATE UNIQUE INDEX "delivery_purchase_scenario_active_name_key"
    ON "delivery"."delivery_purchase_scenario"("name")
    WHERE "archived_at" IS NULL;
