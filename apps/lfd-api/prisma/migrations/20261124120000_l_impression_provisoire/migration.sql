-- L'IMPRESSION PROVISOIRE DU DOSSIER DU JOUR
--
-- Plan `documentation/fournil/plan-impression-provisoire.md`, § 2, lot P2.
--
-- ADDITIVE : une table neuve du schéma `production`. Aucune ligne existante
-- touchée, aucun droit accordé.
--
-- Une ligne par impression provisoire : `run` est le `#` du bandeau, tiré
-- `max(run) + 1` ; l'unicité (`service_day`, `run`) arbitre deux tirages
-- simultanés, et le perdant reprend au numéro suivant. Aucune clé étrangère :
-- une journée n'a pas de ligne `production_day` avant son arrêt.
--
-- Retour arrière du SCHÉMA : `DROP TABLE`, une fois qu'aucun binaire ne la lit.

SET lock_timeout = '5s';

CREATE TABLE "production"."provisional_print" (
    "id"                 TEXT           NOT NULL,
    "service_day"        VARCHAR(10)    NOT NULL,
    "run"                INTEGER        NOT NULL,
    "commerce_version"   BIGINT         NOT NULL,
    "printed_at"         TIMESTAMPTZ(6) NOT NULL,
    "printed_by"         TEXT           NOT NULL,
    "order_fingerprints" JSONB          NOT NULL,
    "parts"              JSONB          NOT NULL,

    CONSTRAINT "provisional_print_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provisional_print_run_check" CHECK ("run" >= 1)
);

CREATE UNIQUE INDEX "provisional_print_service_day_run_key"
    ON "production"."provisional_print" ("service_day", "run");
