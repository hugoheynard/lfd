-- L'ANNULATION D'UNE COMMANDE PAR L'ÉQUIPE
--
-- Plan `documentation/order/plan-annulation-de-commande.md`, lot C3
-- (C3.4, C3.4 ter, C3.5).
--
-- 1. Trois colonnes NULLABLES sur `orders` : qui (l'id de la fiche staff,
--    jamais un `sub`), pourquoi, quand. Écrites ensemble, avec le statut, par
--    la seule annulation staff ; les annulations automatiques les laissent
--    vides, et aucune ligne existante n'est rattrapée.
-- 2. `production.order_withdrawal` : la commande retirée du fournil avant d'y
--    être inscrite. Clé primaire sur `order_id` ; aucune clé étrangère, ni
--    vers la journée (qui peut n'avoir aucune ligne), ni vers le commerce.
--
-- ADDITIVE : aucune colonne resserrée, aucune donnée touchée, aucun droit
-- accordé. Retour arrière : `DROP TABLE "production"."order_withdrawal"` et
-- les trois `DROP COLUMN` — à ne faire qu'avant toute annulation réelle.

ALTER TABLE "public"."orders"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by" TEXT,
  ADD COLUMN "cancellation_reason" TEXT;

CREATE TABLE "production"."order_withdrawal" (
    "order_id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_withdrawal_pkey" PRIMARY KEY ("order_id")
);

CREATE INDEX "order_withdrawal_service_day_idx" ON "production"."order_withdrawal"("service_day");
