-- LA TENTATIVE D'ARRÊT AUTOMATIQUE DU PLAN
--
-- Plan `documentation/production/plan-arret-du-plan.md`, §3, B2, lot A2.
--
-- ADDITIVE : une table neuve du schéma `production`. Aucune ligne existante
-- touchée, aucun droit accordé.
--
-- Une ligne par journée visée : la clé primaire est l'unicité qui départage
-- deux instances (`INSERT … ON CONFLICT DO NOTHING`), et qui empêche de
-- retenter — donc de rebalayer les règlements — toutes les cinq minutes.
--
-- Retour arrière du SCHÉMA : `DROP TABLE`, une fois qu'aucun binaire ne la lit.

SET lock_timeout = '5s';

CREATE TABLE "production"."production_auto_close_attempt" (
    "service_day"  VARCHAR(10)    NOT NULL,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL,
    "outcome"      TEXT           NOT NULL,
    "failure"      TEXT,
    "settled_at"   TIMESTAMPTZ(6),

    CONSTRAINT "production_auto_close_attempt_pkey" PRIMARY KEY ("service_day"),
    CONSTRAINT "production_auto_close_attempt_service_day_check"
        CHECK ("service_day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    CONSTRAINT "production_auto_close_attempt_outcome_check"
        CHECK ("outcome" IN ('pending', 'closed', 'empty', 'failed'))
);
