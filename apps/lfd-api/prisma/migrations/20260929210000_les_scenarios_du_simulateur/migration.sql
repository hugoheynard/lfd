-- LES SCÉNARIOS DU SIMULATEUR — `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 9, L9-C7.
--
-- Purement ADDITIVE : une table neuve dans `production` (Q10), sans journée
-- (exception D7 écrite dans `test/day-change-triggers.e2e-spec.ts`), sans
-- client, sans clé étrangère.
--
-- Retour arrière : `DROP TABLE "production"."delivery_simulation_scenario"` —
-- ce qu'on y perd n'est que des scénarios d'essai, qui s'exportent aussi en
-- fichier depuis l'écran.

CREATE TABLE "production"."delivery_simulation_scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scenario" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "delivery_simulation_scenario_pkey" PRIMARY KEY ("id")
);

-- Deux scénarios NON archivés ne portent pas le même nom ; un scénario archivé
-- libère le sien. Partiel, comme la plaque d'un véhicule en service : Prisma
-- ne sait pas l'exprimer, il n'apparaît pas dans le schéma.
CREATE UNIQUE INDEX "delivery_simulation_scenario_active_name_key"
    ON "production"."delivery_simulation_scenario"("name")
    WHERE "archived_at" IS NULL;
