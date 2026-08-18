-- CreateTable
CREATE TABLE "account_alert_overrides" (
    "company_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "enabled" BOOLEAN,
    "params" JSONB,
    "delivery" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_alert_overrides_pkey" PRIMARY KEY ("company_id","kind")
);

-- CreateIndex
CREATE INDEX "account_alert_overrides_company_id_idx" ON "account_alert_overrides"("company_id");

-- AddForeignKey
ALTER TABLE "account_alert_overrides" ADD CONSTRAINT "account_alert_overrides_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
