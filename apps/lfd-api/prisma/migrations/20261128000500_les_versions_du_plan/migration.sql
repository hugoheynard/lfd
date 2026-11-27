-- LES VERSIONS DU PLAN DE PRODUCTION
-- (documentation/fournil/plan-historique-des-tirages.md, § 1 et § 2, lot H1).
--
-- Chaque fois que le plan figé d'une journée change — arrêt, retirage,
-- révision, retrait après l'arrêt, réassort lancé — le fournil garde une
-- version : ses commandes, son compte, qui et quand. En ajout seul ; aucune
-- clé étrangère (une version survit à tout ce qui arrive à la journée).
--
-- `production_day.plan_version` porte le numéro de la version courante,
-- écrit par le même `save` que l'état : `NULL` pour une journée jamais
-- versionnée (arrêtée avant ce lot, ou jamais arrêtée).
--
-- ADDITIVE : une table neuve, une colonne nullable. Le binaire d'avant
-- ignore les deux. Aucun droit accordé.
--
-- Retour arrière : `prisma/rollback/20261128000500_les_versions_du_plan.sql`.
SET lock_timeout = '5s';

ALTER TABLE "production"."production_day"
  ADD COLUMN "plan_version" INTEGER;

CREATE TABLE "production"."plan_versions" (
    "id"               TEXT           NOT NULL,
    "service_day"      VARCHAR(10)    NOT NULL,
    "version"          INTEGER        NOT NULL,
    "cause"            TEXT           NOT NULL,
    "recorded_at"      TIMESTAMPTZ(6) NOT NULL,
    "recorded_by_kind" TEXT           NOT NULL,
    "recorded_by_id"   TEXT,
    "recorded_by_name" TEXT,
    "closed_at"        TIMESTAMPTZ(6) NOT NULL,
    "print_run"        INTEGER        NOT NULL,
    "content_version"  INTEGER        NOT NULL,
    "content"          JSONB          NOT NULL,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_versions_version_check" CHECK ("version" >= 1),
    CONSTRAINT "plan_versions_print_run_check" CHECK ("print_run" >= 1),
    CONSTRAINT "plan_versions_cause_check" CHECK ("cause" IN (
      'closed', 'auto_closed', 'retaken', 'order_revised',
      'order_withdrawn', 'resupply_launched', 'opened_by_resupply'
    )),
    CONSTRAINT "plan_versions_recorded_by_kind_check" CHECK (
      "recorded_by_kind" IN ('staff', 'customer', 'guest', 'system')
    ),
    -- L'identifiant et le nom ne désignent que le staff : un client n'entre
    -- pas au schéma `production`.
    CONSTRAINT "plan_versions_recorded_by_staff_only_check" CHECK (
      "recorded_by_kind" = 'staff'
      OR ("recorded_by_id" IS NULL AND "recorded_by_name" IS NULL)
    )
);

CREATE UNIQUE INDEX "plan_versions_service_day_version_key"
    ON "production"."plan_versions" ("service_day", "version");
