-- Les remises de panier, une ligne par remise — plan
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md,
-- § 18.2 et § 18.3 (lot M2).
--
-- ADDITIVE : trois tables neuves, aucune colonne touchée. Les colonnes
-- `discount_*` de `orders` et de `delivery_note` restent écrites et lues ;
-- personne ne lit encore ces tables. Elles ne sont remplies que par le script
-- de reprise (`prisma/backfill-order-discounts.ts`) : reproduire `splitCents`
-- en PL/pgSQL serait écrire une seconde arithmétique (§ 18.3).
--
-- AUCUN déclencheur ici : le contrôle « somme des remises actives =
-- `orders.discount_cents` » naît strict en M3, après la seconde passe de
-- reprise (§ 18.2, runbook § 18.3, temps 5).
--
-- Réversible tant que M3 n'est pas déployé :
--   DROP TABLE "public"."delivery_note_discounts";
--   DROP TABLE "public"."order_line_discounts";
--   DROP TABLE "public"."order_discounts";

SET lock_timeout = '5s';

CREATE TABLE "public"."order_discounts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "promotion_id" TEXT,
    "adjustment" JSONB,
    "label" JSONB,
    "base_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "amount_ttc_cents" INTEGER,
    "vat_shares" JSONB NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_discounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_discounts_origin_check" CHECK ("origin" IN ('computed', 'frozen')),
    CONSTRAINT "order_discounts_rank_check" CHECK ("rank" >= 1),
    CONSTRAINT "order_discounts_vat_shares_array" CHECK (jsonb_typeof("vat_shares") = 'array')
);

CREATE TABLE "public"."order_line_discounts" (
    "order_line_id" TEXT NOT NULL,
    "order_discount_id" TEXT NOT NULL,

    CONSTRAINT "order_line_discounts_pkey" PRIMARY KEY ("order_line_id", "order_discount_id")
);

CREATE TABLE "public"."delivery_note_discounts" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "order_discount_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "amount_ttc_cents" INTEGER,
    "vat_shares" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_note_discounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_note_discounts_vat_shares_array" CHECK (jsonb_typeof("vat_shares") = 'array')
);

CREATE INDEX "order_discounts_order_id_idx" ON "public"."order_discounts"("order_id");

-- Un rang par commande parmi les remises ACTIVES : une révision archive les
-- siennes (`archived_at`) et en insère de nouvelles aux mêmes rangs (§ 18.5).
-- C'est aussi ce qui rend la reprise sûre contre deux passes concurrentes.
CREATE UNIQUE INDEX "order_discounts_order_id_rank_active_key"
  ON "public"."order_discounts"("order_id", "rank")
  WHERE "archived_at" IS NULL;

CREATE INDEX "order_line_discounts_order_discount_id_idx" ON "public"."order_line_discounts"("order_discount_id");

CREATE INDEX "delivery_note_discounts_order_discount_id_idx" ON "public"."delivery_note_discounts"("order_discount_id");

CREATE UNIQUE INDEX "delivery_note_discounts_note_id_order_discount_id_key" ON "public"."delivery_note_discounts"("note_id", "order_discount_id");

ALTER TABLE "public"."order_discounts" ADD CONSTRAINT "order_discounts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CASCADE, et c'est voulu : la révision supprime et recrée les lignes de la
-- commande (`lines: { deleteMany }`) ; un RESTRICT ferait refuser toute
-- révision d'une commande reprise entre M2 et M3.
ALTER TABLE "public"."order_line_discounts" ADD CONSTRAINT "order_line_discounts_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."order_line_discounts" ADD CONSTRAINT "order_line_discounts_order_discount_id_fkey" FOREIGN KEY ("order_discount_id") REFERENCES "public"."order_discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."delivery_note_discounts" ADD CONSTRAINT "delivery_note_discounts_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."delivery_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."delivery_note_discounts" ADD CONSTRAINT "delivery_note_discounts_order_discount_id_fkey" FOREIGN KEY ("order_discount_id") REFERENCES "public"."order_discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
