-- LA TRACE D'ENVOI DU DOSSIER DU JOUR
--
-- Plan `documentation/production/plan-envoi-du-dossier.md`, lot E3.
--
-- ADDITIVE : une table neuve du schéma `production`. Aucune ligne existante
-- touchée, aucun droit accordé.
--
-- Une ligne par (journée, instant de clôture ou de retirage, destinataire) :
-- la clé primaire est l'idempotence de l'envoi, le fait durable qui le
-- déclenche étant livré au moins une fois.
--
-- Retour arrière du SCHÉMA : `DROP TABLE`, une fois qu'aucun binaire ne la lit.

SET lock_timeout = '5s';

CREATE TABLE "production"."production_dossier_dispatch" (
    "service_day"    VARCHAR(10)    NOT NULL,
    "occasion_at"    TIMESTAMPTZ(6) NOT NULL,
    "recipient_id"   TEXT           NOT NULL,
    "recipient_name" TEXT           NOT NULL,
    "outcome"        TEXT           NOT NULL,
    "provider_id"    TEXT,
    "failure"        TEXT,
    "claimed_at"     TIMESTAMPTZ(6) NOT NULL,
    "settled_at"     TIMESTAMPTZ(6),

    CONSTRAINT "production_dossier_dispatch_pkey"
        PRIMARY KEY ("service_day", "occasion_at", "recipient_id"),
    CONSTRAINT "production_dossier_dispatch_outcome_check"
        CHECK ("outcome" IN ('pending', 'sent', 'failed'))
);
