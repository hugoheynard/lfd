-- LES OPÉRATIONS APRÈS DÉPLOIEMENT — la trace et la machine d'états (2026-11-01)
-- documentation/ops/plan-operations-apres-deploiement.md, § 3.5, § 7.3 et § 7.4.
--
-- ADDITIVE : une table neuve dans le schéma `ops`, aucune ligne écrite,
-- aucune colonne existante touchée.
--
-- 1. `ops.post_deploy_runs` : une ligne par simulation, que « Appliquer »
--    fait avancer (`simulated` → `running` → `succeeded` | `failed` |
--    `interrupted`). Un CHECK tient la liste des états.
-- 2. L'index unique PARTIEL `post_deploy_runs_one_running_key` : une seule
--    application en cours par opération. Il remplace le verrou consultatif du
--    § 3.6, que le pooler rendait inopérant (§ 7.4).
-- 3. L'index de lecture du dernier passage par opération.
--
-- Retour arrière : `prisma/rollback/20261101110100_les_operations_apres_deploiement.sql`.

SET lock_timeout = '5s';

CREATE TABLE "ops"."post_deploy_runs" (
    "id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "simulated_by" TEXT NOT NULL,
    "simulated_at" TIMESTAMP(3) NOT NULL,
    "simulation_report" JSONB NOT NULL,
    "started_at" TIMESTAMP(3),
    "progress_report" JSONB,
    "finished_at" TIMESTAMP(3),
    "failure" TEXT,

    CONSTRAINT "post_deploy_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "post_deploy_runs_state_check" CHECK (
      "state" IN ('simulated', 'running', 'succeeded', 'failed', 'interrupted')
    )
);

CREATE INDEX "post_deploy_runs_operation_key_simulated_at_idx"
  ON "ops"."post_deploy_runs"("operation_key", "simulated_at" DESC);

CREATE UNIQUE INDEX "post_deploy_runs_one_running_key"
  ON "ops"."post_deploy_runs"("operation_key")
  WHERE "state" = 'running';
