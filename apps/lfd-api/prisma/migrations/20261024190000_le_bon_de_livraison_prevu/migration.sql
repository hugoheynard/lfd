-- LE BON DE LIVRAISON PRÉVU — lot E1 de
-- documentation/commandes/plan-e1-bon-de-livraison-prevu.md.
--
-- Deux tables et un énuméré, neufs. Le BL-1 d'une commande naît à l'arrêt du
-- plan (`planned`), se réécrit à chaque re-clôture tant qu'il est prévu, et
-- passe `voided` quand sa commande est annulée. Personne ne le lit encore.
--
-- - `delivery_note` : unicité `(order_id, rank)` (une seconde livraison du fait
--   d'arrêt ne crée rien), `number` unique (un numéro ne se réemploie jamais,
--   annulé compris), CHECK `rank >= 1`. Clé étrangère vers `orders` seulement,
--   en RESTRICT : un BL ne disparaît pas avec sa commande.
-- - `delivery_note_line` : CHECK `quantity >= 0` (une ligne à zéro est
--   recopiée, plan E1 § 6). AUCUNE clé vers `order_lines` : la révision d'une
--   commande supprime puis recrée ses lignes. Les TTC sont nullables, recopiés
--   tels quels.
--
-- ADDITIVE : aucune table existante touchée, aucune valeur écrite. Retour
-- arrière : `DROP TABLE "public"."delivery_note_line"`, puis
-- `DROP TABLE "public"."delivery_note"`, puis `DROP TYPE "public"."DeliveryNoteStatus"`.

CREATE TYPE "public"."DeliveryNoteStatus" AS ENUM ('planned', 'prepared', 'handed_over', 'voided');

CREATE TABLE "public"."delivery_note" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" "public"."DeliveryNoteStatus" NOT NULL,
    "planned_at" TIMESTAMPTZ(6) NOT NULL,
    "voided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_note_rank_positive" CHECK ("rank" >= 1)
);

CREATE TABLE "public"."delivery_note_line" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_price_millicents" INTEGER NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "unit_price_ttc_cents" INTEGER,
    "line_total_ttc_cents" INTEGER,

    CONSTRAINT "delivery_note_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_note_line_quantity_not_negative" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX "delivery_note_number_key" ON "public"."delivery_note"("number");

CREATE UNIQUE INDEX "delivery_note_order_id_rank_key" ON "public"."delivery_note"("order_id", "rank");

CREATE INDEX "delivery_note_line_note_id_idx" ON "public"."delivery_note_line"("note_id");

ALTER TABLE "public"."delivery_note"
    ADD CONSTRAINT "delivery_note_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."delivery_note_line"
    ADD CONSTRAINT "delivery_note_line_note_id_fkey"
        FOREIGN KEY ("note_id") REFERENCES "public"."delivery_note"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
