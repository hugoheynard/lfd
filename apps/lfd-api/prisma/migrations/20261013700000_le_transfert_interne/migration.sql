-- Lot T1 du transfert interne
-- (documentation/livraisons/transferts/plan-transfert-interne.md, §3, §4).
--
-- Un site servi par transfert reçoit ses retraits par un TRANSFERT INTERNE,
-- qui passe dans une tournée comme UN arrêt de genre `transfer`. Ses commandes
-- restent des retraits : elles vivent dans `delivery_internal_transfer_item`,
-- jamais dans `delivery_round_stop`.
--
-- ⚠️ `order_id` de `delivery_round_stop` perd son NOT NULL dans CE déploiement,
-- avec le code qui écrit le premier NULL — assumé par le §0 du CLAUDE.md
-- (pré-release, Hugo 2026-10-04) et par le plan (§4, S3 du §12.3). Aucune
-- donnée n'est détruite : les lignes existantes prennent `kind = 'order'` par
-- défaut, portent toutes un `order_id`, et satisfont le CHECK, qui tient pour
-- elles la garantie que NOT NULL donnait.

-- ─── Le transfert et ses commandes ─────────────────────────────────────────
-- Aucune unicité (service_day, site_id) : autant de transferts que nécessaire
-- par site et par jour (§1, Q-T3). `site_id` et `order_id` sont OPAQUES :
-- aucune clé étrangère vers `public`.
CREATE TABLE "delivery"."delivery_internal_transfer" (
    "id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "site_id" TEXT NOT NULL,
    "site_label" TEXT NOT NULL,
    "departed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_internal_transfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_internal_transfer_version_positive" CHECK ("version" > 0)
);

CREATE INDEX "delivery_internal_transfer_service_day_site_id_idx"
    ON "delivery"."delivery_internal_transfer"("service_day", "site_id");

-- Ses éléments (décision de Hugo du 2026-10-13) : des commandes, ou des
-- réassorts d'un site — concept NON BÂTI, `refill_id` sans clé étrangère.
CREATE TYPE "delivery"."delivery_transfer_item_kind" AS ENUM ('order', 'refill');

CREATE TABLE "delivery"."delivery_internal_transfer_item" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "kind" "delivery"."delivery_transfer_item_kind" NOT NULL,
    "order_id" TEXT,
    "refill_id" TEXT,
    "attached_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_internal_transfer_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_internal_transfer_item_kind_check" CHECK (
        ("kind" = 'order' AND "order_id" IS NOT NULL AND "refill_id" IS NULL)
     OR ("kind" = 'refill' AND "order_id" IS NULL AND "refill_id" IS NOT NULL)
    )
);

CREATE INDEX "delivery_internal_transfer_item_transfer_id_idx"
    ON "delivery"."delivery_internal_transfer_item"("transfer_id");

-- Un élément n'est que dans UN transfert (une commande n'est jamais retirée
-- d'un transfert parti ou reçu, §3) — les NULL de l'autre genre sont ignorés.
CREATE UNIQUE INDEX "delivery_internal_transfer_item_order_key"
    ON "delivery"."delivery_internal_transfer_item"("order_id")
    WHERE "order_id" IS NOT NULL;
CREATE UNIQUE INDEX "delivery_internal_transfer_item_refill_key"
    ON "delivery"."delivery_internal_transfer_item"("refill_id")
    WHERE "refill_id" IS NOT NULL;

ALTER TABLE "delivery"."delivery_internal_transfer_item"
    ADD CONSTRAINT "delivery_internal_transfer_item_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "delivery"."delivery_internal_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le manifeste FIGÉ au départ (décision de Hugo du 2026-10-13 : « on doit
-- savoir ce qu'on transporte ») : la référence de la réception au site (T2).
CREATE TABLE "delivery"."delivery_internal_transfer_manifest_line" (
    "transfer_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "delivery_internal_transfer_manifest_line_pkey" PRIMARY KEY ("transfer_id", "item_id", "sku"),
    CONSTRAINT "delivery_internal_transfer_manifest_line_quantity_positive" CHECK ("quantity" > 0)
);

ALTER TABLE "delivery"."delivery_internal_transfer_manifest_line"
    ADD CONSTRAINT "delivery_internal_transfer_manifest_line_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "delivery"."delivery_internal_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- L'écran des tournées suit la version de journée : un transfert ouvert ou
-- parti la fait avancer, comme un arrêt.
CREATE TRIGGER "delivery_internal_transfer_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_internal_transfer"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_internal_transfer_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_internal_transfer"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_internal_transfer_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_internal_transfer"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();

-- ─── Le genre d'arrêt ──────────────────────────────────────────────────────
CREATE TYPE "delivery"."delivery_stop_kind" AS ENUM ('order', 'transfer');

ALTER TABLE "delivery"."delivery_round_stop"
    ADD COLUMN "kind" "delivery"."delivery_stop_kind" NOT NULL DEFAULT 'order',
    ADD COLUMN "transfer_id" TEXT;

ALTER TABLE "delivery"."delivery_round_stop"
    ADD CONSTRAINT "delivery_round_stop_kind_check" CHECK (
        ("kind" = 'order' AND "order_id" IS NOT NULL AND "transfer_id" IS NULL)
     OR ("kind" = 'transfer' AND "order_id" IS NULL AND "transfer_id" IS NOT NULL)
    );

ALTER TABLE "delivery"."delivery_round_stop" ALTER COLUMN "order_id" DROP NOT NULL;

CREATE INDEX "delivery_round_stop_transfer_id_idx"
    ON "delivery"."delivery_round_stop"("transfer_id");

ALTER TABLE "delivery"."delivery_round_stop"
    ADD CONSTRAINT "delivery_round_stop_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "delivery"."delivery_internal_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le jumeau de I3 (`delivery_round_stop_live_order_key`, qui ignore les NULL
-- et reste juste pour les arrêts de commande) : un transfert est dans AU PLUS
-- UNE tournée vivante. Prisma ne sait pas l'exprimer.
CREATE UNIQUE INDEX "delivery_round_stop_live_transfer_key"
    ON "delivery"."delivery_round_stop"("transfer_id")
    WHERE "removed_at" IS NULL AND "closed_at" IS NULL;
