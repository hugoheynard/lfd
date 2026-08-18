-- CreateTable
CREATE TABLE "alert_rule_settings" (
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL,
    "delivery" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_settings_pkey" PRIMARY KEY ("kind")
);
