-- LE RÉGLAGE DE L'ARRÊT DU PLAN ET LES JOURS FERMÉS DU FOURNIL
--
-- Plan `documentation/production/plan-arret-du-plan.md`, §2, Q5, Q6, lot A1.
--
-- ADDITIVE : deux tables neuves du schéma `production`. Aucune ligne existante
-- touchée, aucun droit accordé.
--
-- `production_settings` reste VIDE : l'absence de ligne est le réglage de
-- départ (manuel, alerte à 20:00 — Q1), dit par le domaine
-- (`ProductionCloseSettings.initial`). Un seul défaut, au lieu d'un dans la
-- migration et d'un autre dans le code qui finiraient par diverger.
--
-- Retour arrière du SCHÉMA : `DROP TABLE` des deux tables, une fois qu'aucun
-- binaire ne les lit.

SET lock_timeout = '5s';

-- 1. Le réglage unique : une ligne au plus, `id = 'house'`.
CREATE TABLE "production"."production_settings" (
    "id"         TEXT           NOT NULL DEFAULT 'house',
    "close_mode" TEXT           NOT NULL,
    "close_at"   VARCHAR(5),
    "alert_at"   VARCHAR(5),
    "updated_by" TEXT           NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_settings_single_row_check" CHECK ("id" = 'house'),
    CONSTRAINT "production_settings_close_mode_check" CHECK ("close_mode" IN ('auto', 'manual')),
    CONSTRAINT "production_settings_close_at_check"
        CHECK ("close_at" IS NULL OR "close_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "production_settings_alert_at_check"
        CHECK ("alert_at" IS NULL OR "alert_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "production_settings_mode_hour_check" CHECK (
        ("close_mode" = 'auto' AND "close_at" IS NOT NULL)
        OR ("close_mode" = 'manual' AND "alert_at" IS NOT NULL)
    )
);

-- 2. Les jours fermés : une ligne par journée sans production.
CREATE TABLE "production"."production_closed_day" (
    "service_day" VARCHAR(10)    NOT NULL,
    "declared_by" TEXT           NOT NULL,
    "declared_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_closed_day_pkey" PRIMARY KEY ("service_day"),
    CONSTRAINT "production_closed_day_service_day_check"
        CHECK ("service_day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
