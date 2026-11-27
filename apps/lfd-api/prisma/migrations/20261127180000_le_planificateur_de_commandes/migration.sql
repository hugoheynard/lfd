-- LE PLANIFICATEUR DE COMMANDES DES PROS — deux tables neuves dans `recurring`
-- (documentation/commandes/planificateur/plan-planificateur-de-commandes.md, lot L1).
--
-- ADDITIVE : deux tables neuves, vides. Aucune colonne existante touchée ; les
-- binaires en place ne les lisent pas. Aucune clé étrangère ne sort du schéma :
-- la personne, la société (un site est une société) et la commande sont des
-- identifiants opaques.
--
-- Un jour peut porter plusieurs colonnes, une par créneau (Hugo, 2026-11-27) :
-- le créneau est sorti de `routing` en deux colonnes pour l'unicité.
--
-- Retour arrière : `prisma/rollback/20261127180000_le_planificateur_de_commandes.sql`.
SET lock_timeout = '5s';

CREATE TABLE "recurring"."planned_columns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "service_day" DATE NOT NULL,
    "window_start" TEXT,
    "window_end" TEXT NOT NULL,
    "routing" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "converts_at" TIMESTAMPTZ(6),
    "order_id" TEXT,
    "refusal_cause" TEXT,
    "refusal_reason" TEXT,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planned_columns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "planned_columns_status_known"
      CHECK ("status" IN ('draft', 'placed', 'refused', 'missed', 'withdrawn')),
    CONSTRAINT "planned_columns_version_positive" CHECK ("version" >= 1),
    CONSTRAINT "planned_columns_lines_array" CHECK (jsonb_typeof("lines") = 'array'),
    -- Une colonne passée a sa commande, une colonne refusée sa cause et sa phrase.
    CONSTRAINT "planned_columns_outcome_shape" CHECK (
      ("status" = 'placed' AND "order_id" IS NOT NULL AND "refusal_cause" IS NULL)
      OR ("status" = 'refused' AND "order_id" IS NULL
        AND "refusal_cause" IS NOT NULL AND "refusal_reason" IS NOT NULL)
      OR ("status" IN ('draft', 'missed', 'withdrawn')
        AND "order_id" IS NULL AND "refusal_cause" IS NULL)
    )
);
-- Une colonne vivante par société, jour et créneau. Une colonne retirée
-- libère son créneau ; un créneau sans début (« avant 9 h ») ne se double pas.
CREATE UNIQUE INDEX "planned_columns_one_per_window" ON "recurring"."planned_columns"
  ("company_id", "service_day", "window_start", "window_end") NULLS NOT DISTINCT
  WHERE "status" <> 'withdrawn';
CREATE INDEX "planned_columns_company_id_service_day_idx"
  ON "recurring"."planned_columns" ("company_id", "service_day");
-- Ce que le balayage (L2) lira : les colonnes encore en brouillon, par leur jour.
CREATE INDEX "planned_columns_draft_idx" ON "recurring"."planned_columns" ("service_day")
  WHERE "status" = 'draft';

CREATE TABLE "recurring"."wishlist_items" (
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id", "company_id", "sku")
);
