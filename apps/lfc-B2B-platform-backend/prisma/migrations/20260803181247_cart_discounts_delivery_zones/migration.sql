-- CreateEnum
CREATE TYPE "CartAdjustmentMode" AS ENUM ('percent', 'amount');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discount_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pickup_addresses" ADD COLUMN     "discount_mode" "CartAdjustmentMode",
ADD COLUMN     "discount_value" INTEGER;

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "code_postal" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "fee_mode" "CartAdjustmentMode" NOT NULL,
    "fee_value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_code_postal_key" ON "delivery_zones"("code_postal");
