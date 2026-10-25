-- LA DÉCISION DU DÉPART INCOMPLET, ET L'OMBRE DE L'ARGENT — lots E6b et E6c1
-- de documentation/commandes/plan-e6-le-depart-incomplet.md (§ 12, § 13).
--
-- Schéma seulement : AUCUNE donnée écrite. Tout naît nul ou vide.
--
-- Côté COLISAGE, `packing.packing_order.shortfall_authorized_at` : le
-- commerce a décidé le départ ; les lignes dues sont réduites aux quantités
-- au bac. Une fiche autorisée ne se re-signale pas, ne se retire pas.
--
-- Côté COMMERCE :
--   - `public.order_shortfall_decision` : la décision, une par commande
--     (unicité sur `order_id`), définitive. `remainder` n'admet que
--     `abandoned` : « à relivrer » arrive avec E7, qui élargira le CHECK ;
--   - `orders.shortfall_decided_at` : le signal résolu (il reste, il n'attend
--     plus de décision) ; il ne se pose que sur un signal (CHECK) ;
--   - `orders.billable_*` et `orders.settled_on` : les montants facturables,
--     posés au solde. EN OMBRE : aucun lecteur de facture ni de prélèvement
--     ne les lit (E6c2). Les sept entiers et le jour vont ensemble (CHECK) ;
--     la ventilation suit la commande, `NULL` compris pour une commande
--     d'avant le 2026-09-07. PAS de déclencheur de gel ici : l'ombre reste
--     corrigeable tant que rien n'est facturé ; le gel se pose en E6c2.
--
-- Côté BONS DE LIVRAISON (§ 14, Hugo) : `content_version` (+1 à chaque
-- changement de lignes ou de montants ; 1 pour tout BL existant) et la
-- dernière impression (`printed_version`, `printed_at`, `printed_by`, ensemble
-- ou aucun). Une impression d'une autre version que le contenu = « le bon de
-- livraison a changé depuis son impression — réimprimez-le ».
--
-- ADDITIVE. Retour arrière : supprimer la table, les contraintes, puis les
-- colonnes — aucune n'est lue hors de ces deux lots.

ALTER TABLE "packing"."packing_order"
    ADD COLUMN "shortfall_authorized_at" TIMESTAMPTZ(6);

ALTER TABLE "public"."orders"
    ADD COLUMN "shortfall_decided_at" TIMESTAMPTZ(6),
    ADD COLUMN "billable_subtotal_cents" INTEGER,
    ADD COLUMN "billable_discount_cents" INTEGER,
    ADD COLUMN "billable_voucher_discount_cents" INTEGER,
    ADD COLUMN "billable_delivery_fee_cents" INTEGER,
    ADD COLUMN "billable_late_fee_cents" INTEGER,
    ADD COLUMN "billable_vat_cents" INTEGER,
    ADD COLUMN "billable_vat_shares" JSONB,
    ADD COLUMN "billable_total_cents" INTEGER,
    ADD COLUMN "settled_on" DATE;

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_shortfall_decided_on_signal"
        CHECK ("shortfall_decided_at" IS NULL OR "shortfall_reported_at" IS NOT NULL);

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_billable_all_or_nothing"
        CHECK (
            ("billable_total_cents" IS NULL
              AND "billable_subtotal_cents" IS NULL
              AND "billable_discount_cents" IS NULL
              AND "billable_voucher_discount_cents" IS NULL
              AND "billable_delivery_fee_cents" IS NULL
              AND "billable_late_fee_cents" IS NULL
              AND "billable_vat_cents" IS NULL
              AND "billable_vat_shares" IS NULL
              AND "settled_on" IS NULL)
            OR
            ("billable_total_cents" IS NOT NULL
              AND "billable_subtotal_cents" IS NOT NULL
              AND "billable_discount_cents" IS NOT NULL
              AND "billable_voucher_discount_cents" IS NOT NULL
              AND "billable_delivery_fee_cents" IS NOT NULL
              AND "billable_late_fee_cents" IS NOT NULL
              AND "billable_vat_cents" IS NOT NULL
              AND "settled_on" IS NOT NULL)
        );

CREATE TABLE "public"."order_shortfall_decision" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_by_staff_id" TEXT NOT NULL,
    "remainder" TEXT NOT NULL,
    "departing" JSONB NOT NULL,
    "signal_reported_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_shortfall_decision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_shortfall_decision_remainder" CHECK ("remainder" IN ('abandoned')),
    CONSTRAINT "order_shortfall_decision_departing_array"
        CHECK (jsonb_typeof("departing") = 'array')
);

CREATE UNIQUE INDEX "order_shortfall_decision_order_id_key"
    ON "public"."order_shortfall_decision"("order_id");

ALTER TABLE "public"."order_shortfall_decision"
    ADD CONSTRAINT "order_shortfall_decision_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."delivery_note"
    ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "printed_version" INTEGER,
    ADD COLUMN "printed_at" TIMESTAMPTZ(6),
    ADD COLUMN "printed_by" TEXT;

ALTER TABLE "public"."delivery_note"
    ADD CONSTRAINT "delivery_note_printed_together"
        CHECK (("printed_version" IS NULL) = ("printed_at" IS NULL)
           AND ("printed_at" IS NULL) = ("printed_by" IS NULL)),
    ADD CONSTRAINT "delivery_note_content_version_positive"
        CHECK ("content_version" >= 1 AND ("printed_version" IS NULL OR "printed_version" >= 1));
