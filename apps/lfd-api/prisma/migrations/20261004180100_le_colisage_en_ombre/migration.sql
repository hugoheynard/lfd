-- LE COLISAGE EN OMBRE — plan `documentation/colisage/plan-domaine-colisage.md`,
-- lot K1 (§12.2, §13).
--
-- ADDITIVE : un schéma neuf, quatre tables neuves, vides. Aucune ligne
-- existante touchée, aucun droit accordé à un rôle. Elles se remplissent par
-- les abonnés durables du bloc `packing`, et personne ne les lit pour décider.
--
-- ⚠️ Pas de déclencheur de journal ici, et c'est un écart NOMMÉ au §10.3 : une
-- version par journée du colisage n'a pas de lecteur en K1, et son journal
-- demanderait son balayage. Il arrive avec la bascule (K2).
--
-- Retour arrière (migration EN AVANT) : `DROP SCHEMA "packing" CASCADE`. Ne
-- perd que l'ombre.

CREATE SCHEMA IF NOT EXISTS "packing";

CREATE TABLE "packing"."packing_order" (
    "service_day"        VARCHAR(10)    NOT NULL,
    "order_id"           TEXT           NOT NULL,
    "reference"          TEXT           NOT NULL,
    "customer_label"     TEXT           NOT NULL,
    "fulfillment_method" TEXT           NOT NULL,
    "due_at"             VARCHAR(5),
    "drawn_at"           TIMESTAMPTZ(6) NOT NULL,
    "packed_at"          TIMESTAMPTZ(6),
    "packed_by"          TEXT,
    "container_count"    INTEGER        NOT NULL DEFAULT 0,

    CONSTRAINT "packing_order_pkey" PRIMARY KEY ("service_day", "order_id"),
    CONSTRAINT "packing_order_packed_check" CHECK (("packed_at" IS NULL) = ("packed_by" IS NULL)),
    CONSTRAINT "packing_order_container_count_check" CHECK ("container_count" >= 0)
);

CREATE TABLE "packing"."packing_line" (
    "service_day"     VARCHAR(10)    NOT NULL,
    "order_id"        TEXT           NOT NULL,
    "sku"             TEXT           NOT NULL,
    "product_name"    TEXT           NOT NULL,
    "quantity"        INTEGER        NOT NULL,
    "packed_at"       TIMESTAMPTZ(6),
    "packed_by"       TEXT,
    "packed_initials" TEXT           NOT NULL DEFAULT '',

    CONSTRAINT "packing_line_pkey" PRIMARY KEY ("service_day", "order_id", "sku"),
    CONSTRAINT "packing_line_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "packing_line_packed_check" CHECK (("packed_at" IS NULL) = ("packed_by" IS NULL))
);

ALTER TABLE "packing"."packing_line" ADD CONSTRAINT "packing_line_service_day_order_id_fkey"
    FOREIGN KEY ("service_day", "order_id") REFERENCES "packing"."packing_order"("service_day", "order_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "packing"."packing_stock" (
    "service_day" VARCHAR(10) NOT NULL,
    "sku"         TEXT        NOT NULL,
    "received"    INTEGER     NOT NULL DEFAULT 0,
    "returned"    INTEGER     NOT NULL DEFAULT 0,
    "packed"      INTEGER     NOT NULL DEFAULT 0,

    CONSTRAINT "packing_stock_pkey" PRIMARY KEY ("service_day", "sku"),
    CONSTRAINT "packing_stock_counts_check"
        CHECK ("received" >= 0 AND "returned" >= 0 AND "packed" >= 0)
);

CREATE TABLE "packing"."packing_receipt" (
    "id"          TEXT           NOT NULL,
    "kind"        TEXT           NOT NULL,
    "service_day" VARCHAR(10)    NOT NULL,
    "sku"         TEXT           NOT NULL,
    "quantity"    INTEGER        NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "packing_receipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "packing_receipt_kind_check" CHECK ("kind" IN ('handoff', 'return')),
    CONSTRAINT "packing_receipt_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "packing_receipt_service_day_sku_idx"
    ON "packing"."packing_receipt"("service_day", "sku");
