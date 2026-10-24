-- LE BON DE LIVRAISON PORTE SES TOTAUX — lot E4a de
-- documentation/commandes/plan-e4a-totaux-du-bon.md (§ 1.3 et § 4).
--
-- Schéma seulement : AUCUNE donnée écrite. Les BL existants restent sans
-- en-tête ; le réconciliateur (`ReconcileDeliveryNotes`) les complète depuis
-- la commande, dans le code.
--
-- Ligne : `pickup_discount_eligible`, nullable (les lignes d'avant E4a ne
-- l'ont pas ; on n'invente pas la valeur).
-- En-tête : sept entiers et trois colonnes recopiées telles quelles
-- (`delivery_vat_mode`, `late_fee_adjustment`, `vat_shares`, `NULL` compris
-- pour une commande ancienne). Un CHECK « tout ou rien » sur les sept entiers
-- seulement (plan § 4) : un en-tête est posé entier, ou pas du tout.
--
-- ADDITIVE. Retour arrière : supprimer la contrainte, puis les onze colonnes.

ALTER TABLE "public"."delivery_note_line"
    ADD COLUMN "pickup_discount_eligible" BOOLEAN;

ALTER TABLE "public"."delivery_note"
    ADD COLUMN "subtotal_cents" INTEGER,
    ADD COLUMN "discount_cents" INTEGER,
    ADD COLUMN "voucher_discount_cents" INTEGER,
    ADD COLUMN "delivery_fee_cents" INTEGER,
    ADD COLUMN "delivery_vat_mode" TEXT,
    ADD COLUMN "late_fee_cents" INTEGER,
    ADD COLUMN "late_fee_adjustment" JSONB,
    ADD COLUMN "vat_shares" JSONB,
    ADD COLUMN "vat_cents" INTEGER,
    ADD COLUMN "total_cents" INTEGER;

ALTER TABLE "public"."delivery_note"
    ADD CONSTRAINT "delivery_note_terms_all_or_nothing"
        CHECK (
            ("subtotal_cents" IS NULL AND "discount_cents" IS NULL
             AND "voucher_discount_cents" IS NULL AND "delivery_fee_cents" IS NULL
             AND "late_fee_cents" IS NULL AND "vat_cents" IS NULL AND "total_cents" IS NULL)
            OR
            ("subtotal_cents" IS NOT NULL AND "discount_cents" IS NOT NULL
             AND "voucher_discount_cents" IS NOT NULL AND "delivery_fee_cents" IS NOT NULL
             AND "late_fee_cents" IS NOT NULL AND "vat_cents" IS NOT NULL AND "total_cents" IS NOT NULL)
        );
