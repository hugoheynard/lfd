-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "handover_token" TEXT,
ADD COLUMN     "handed_over_at" TIMESTAMP(3),
ADD COLUMN     "handed_over_by" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_handover_token_key" ON "orders"("handover_token");
