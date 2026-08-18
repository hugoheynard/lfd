-- Origine récurrente d'une commande : abonnement source (« récurrent ») + écart
-- vs le gabarit ({ added, removed } — pills +/−). Nuls tant qu'aucun planificateur
-- ne produit de commandes depuis un abonnement.
ALTER TABLE "orders" ADD COLUMN "from_subscription_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "recurring_deltas" JSONB;

-- CreateIndex
CREATE INDEX "orders_from_subscription_id_idx" ON "orders"("from_subscription_id");
