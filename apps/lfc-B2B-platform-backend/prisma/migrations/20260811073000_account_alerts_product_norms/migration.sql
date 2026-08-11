-- Journal des alertes : une ligne par (type × commande), findings figés.
CREATE TABLE "account_alerts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "findings" JSONB NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_alerts_idempotency_key_key" ON "account_alerts"("idempotency_key");
CREATE INDEX "account_alerts_company_id_occurred_at_idx" ON "account_alerts"("company_id", "occurred_at");
CREATE INDEX "account_alerts_company_id_acknowledged_at_idx" ON "account_alerts"("company_id", "acknowledged_at");

ALTER TABLE "account_alerts" ADD CONSTRAINT "account_alerts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Norme produit matérialisée : médiane cross-comptes, recalculée par cron.
CREATE TABLE "product_norms" (
    "sku" TEXT NOT NULL,
    "median_quantity" DECIMAL(12,2) NOT NULL,
    "sample_lines" INTEGER NOT NULL,
    "window_days" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_norms_pkey" PRIMARY KEY ("sku")
);
