-- Le bloc des paniers récurrents : son schéma `recurring`, l'échéance devenue
-- une ligne (documentation/commandes/paniers-recurrents/plan-bloc-recurrent.md).
--
-- La production ne contient aucun panier (compté le 2026-11-24, § 0 du plan) :
-- les tables neuves se créent vides, et les anciennes tables
-- `public.subscription*`, vides elles aussi, se retirent dans la même
-- migration (Q-B4). Aucune clé étrangère ne sort de `recurring` : une personne,
-- une société, une commande et un point de retrait s'y désignent par
-- identifiant.
--
-- IRRÉVERSIBLE par redéploiement de l'image précédente : elle lit des tables
-- que cette migration retire. Le retour arrière est une migration inverse,
-- générée au bâti (`prisma migrate diff`, de ce schéma vers le précédent) et
-- gardée prête à côté du plan ; sans donnée à recopier tant qu'aucun panier
-- n'a été ouvert.

-- Le garde-fou : les anciennes tables ne se retirent que vides. Un panier
-- ouvert entre le comptage et le déploiement arrête la migration au lieu
-- d'être détruit.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."subscriptions")
    OR EXISTS (SELECT 1 FROM "public"."subscription_occurrences")
    OR EXISTS (SELECT 1 FROM "public"."subscription_occurrence_runs")
    OR EXISTS (SELECT 1 FROM "public"."orders" WHERE "from_subscription_id" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Des paniers récurrents existent en base : la migration du bloc recurring ne les supprime pas. Les reprendre avant de déployer.';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "recurring";

-- ─── Le panier ──────────────────────────────────────────────────────────────
CREATE TABLE "recurring"."basket" (
  "id"                        TEXT PRIMARY KEY,
  "buyer_user_id"             TEXT NOT NULL,
  "company_id"                TEXT,
  "from_order_id"             TEXT,
  "cadence"                   TEXT NOT NULL,
  "status"                    TEXT NOT NULL DEFAULT 'active',
  "start_date"                DATE NOT NULL,
  "end_date"                  DATE,
  "fulfillment_method"        TEXT NOT NULL,
  "delivery_address"          JSONB,
  "pickup_address_id"         TEXT,
  "requested_window"          JSONB NOT NULL,
  "note"                      TEXT NOT NULL DEFAULT '',
  "sales_terms_key"           TEXT NOT NULL,
  "sales_terms_revision"      INTEGER NOT NULL,
  "sales_terms_file_id"       TEXT,
  "sales_terms_next_revision" INTEGER,
  "sales_terms_next_file_id"  TEXT,
  "sales_terms_effective_on"  DATE,
  "planned_until"             DATE,
  "created_at"                TIMESTAMPTZ(6) NOT NULL,
  "updated_at"                TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "basket_cadence_known"
    CHECK ("cadence" IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT "basket_status_known"
    CHECK ("status" IN ('active', 'paused', 'cancelled')),
  CONSTRAINT "basket_dates_ordered"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  -- Livraison : une adresse et pas de point ; retrait : jamais d'adresse.
  CONSTRAINT "basket_routing_shape" CHECK (
    ("fulfillment_method" = 'delivery' AND "delivery_address" IS NOT NULL AND "pickup_address_id" IS NULL)
    OR ("fulfillment_method" = 'pickup' AND "delivery_address" IS NULL)
  ),
  -- Une version annoncée a toujours sa date d'effet, et l'inverse (§ 7).
  CONSTRAINT "basket_next_terms_together" CHECK (
    ("sales_terms_next_revision" IS NULL) = ("sales_terms_effective_on" IS NULL)
    AND ("sales_terms_next_file_id" IS NULL OR "sales_terms_next_revision" IS NOT NULL)
  )
);
CREATE INDEX "basket_buyer_user_id_idx" ON "recurring"."basket" ("buyer_user_id");
CREATE INDEX "basket_company_id_idx" ON "recurring"."basket" ("company_id");

-- La fiche client compte les paniers actifs : comme l'ancienne table, le panier
-- fait monter la version `companies` du cache des écrans (journal
-- `public.company_change`), par la fonction commune des journaux globaux.
CREATE TRIGGER "basket_company_change_insert"
  AFTER INSERT ON "recurring"."basket"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "basket_company_change_update"
  AFTER UPDATE ON "recurring"."basket"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "basket_company_change_delete"
  AFTER DELETE ON "recurring"."basket"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();

-- ─── Ses lignes ─────────────────────────────────────────────────────────────
CREATE TABLE "recurring"."basket_line" (
  "id"        TEXT PRIMARY KEY,
  "basket_id" TEXT NOT NULL,
  "position"  INTEGER NOT NULL,
  "sku"       TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL,
  CONSTRAINT "basket_line_basket_id_fkey"
    FOREIGN KEY ("basket_id") REFERENCES "recurring"."basket" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "basket_line_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "basket_line_position_not_negative" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "basket_line_basket_id_sku_key" ON "recurring"."basket_line" ("basket_id", "sku");
CREATE UNIQUE INDEX "basket_line_basket_id_position_key" ON "recurring"."basket_line" ("basket_id", "position");

-- ─── Ses échéances ──────────────────────────────────────────────────────────
CREATE TABLE "recurring"."occurrence" (
  "id"          TEXT PRIMARY KEY,
  "basket_id"   TEXT NOT NULL,
  "service_day" DATE NOT NULL,
  "place_on"    DATE NOT NULL,
  "state"       TEXT NOT NULL DEFAULT 'planned',
  "lines"       JSONB,
  "note"        TEXT NOT NULL DEFAULT '',
  "order_id"    TEXT,
  "cause"       TEXT,
  "reason"      TEXT,
  -- L'heure de l'issue : passée, refusée (la dernière fois) ou manquée.
  "settled_at"  TIMESTAMPTZ(6),
  "created_at"  TIMESTAMPTZ(6) NOT NULL,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "occurrence_basket_id_fkey"
    FOREIGN KEY ("basket_id") REFERENCES "recurring"."basket" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "occurrence_state_known"
    CHECK ("state" IN ('planned', 'skipped', 'placed', 'refused', 'missed', 'cancelled')),
  CONSTRAINT "occurrence_placed_before_served" CHECK ("place_on" <= "service_day"),
  -- La forme de chaque état : une commande seulement si passée ; une cause et
  -- sa phrase si refusée ou manquée ; une issue datée dans ces trois cas. Une
  -- échéance annulée garde la cause d'un refus antérieur, s'il y en a eu un.
  CONSTRAINT "occurrence_state_shape" CHECK (
    ("state" = 'placed' AND "order_id" IS NOT NULL AND "cause" IS NULL AND "reason" IS NULL
      AND "settled_at" IS NOT NULL)
    OR ("state" IN ('refused', 'missed') AND "order_id" IS NULL AND "cause" IS NOT NULL
      AND "reason" IS NOT NULL AND "settled_at" IS NOT NULL)
    OR ("state" IN ('planned', 'skipped') AND "order_id" IS NULL AND "cause" IS NULL
      AND "reason" IS NULL AND "settled_at" IS NULL)
    OR ("state" = 'cancelled' AND "order_id" IS NULL
      AND ("cause" IS NULL) = ("reason" IS NULL))
  ),
  -- Une échéance sautée n'a pas de lignes à elle.
  CONSTRAINT "occurrence_skipped_without_lines" CHECK ("state" <> 'skipped' OR "lines" IS NULL)
);
CREATE UNIQUE INDEX "occurrence_basket_id_service_day_key" ON "recurring"."occurrence" ("basket_id", "service_day");
-- Ce que le balayage lit : les échéances encore à passer, par leur jour de passation.
CREATE INDEX "occurrence_due_idx" ON "recurring"."occurrence" ("place_on")
  WHERE "state" IN ('planned', 'refused');

-- ─── La commande : une échéance, au plus une commande (§ 6.1) ──────────────
ALTER TABLE "public"."orders" ADD COLUMN "from_occurrence_day" DATE;
CREATE UNIQUE INDEX "orders_one_per_occurrence"
  ON "public"."orders" ("from_subscription_id", "from_occurrence_day")
  WHERE "from_occurrence_day" IS NOT NULL;

-- La provenance d'une commande ne change plus après sa création : c'est elle
-- que l'unicité lit.
CREATE FUNCTION "public"."orders_keep_recurring_provenance"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."from_subscription_id" IS DISTINCT FROM OLD."from_subscription_id"
    OR NEW."from_occurrence_day" IS DISTINCT FROM OLD."from_occurrence_day"
  THEN
    RAISE EXCEPTION 'La provenance récurrente d''une commande ne se modifie pas (commande %).', OLD."id";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "orders_keep_recurring_provenance"
  BEFORE UPDATE OF "from_subscription_id", "from_occurrence_day" ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."orders_keep_recurring_provenance"();

-- ─── Les anciennes tables, vides en production ──────────────────────────────
DROP TABLE "public"."subscription_occurrence_runs";
DROP TABLE "public"."subscription_occurrences";
DROP TABLE "public"."subscription_lines";
DROP TABLE "public"."subscriptions";
