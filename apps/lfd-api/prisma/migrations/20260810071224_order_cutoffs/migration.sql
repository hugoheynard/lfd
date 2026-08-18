-- CreateTable
CREATE TABLE "order_cutoffs" (
    "id" TEXT NOT NULL,
    "pickup_address_id" TEXT,
    "weekday" INTEGER,
    "days_before" INTEGER NOT NULL DEFAULT 1,
    "time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_cutoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_cutoffs_pickup_address_id_idx" ON "order_cutoffs"("pickup_address_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_cutoffs_pickup_address_id_weekday_key" ON "order_cutoffs"("pickup_address_id", "weekday");
