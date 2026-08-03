-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('delivery', 'pickup');

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivery_address_id_fkey";

-- AlterTable
ALTER TABLE "b2b_platform_settings" ADD COLUMN     "pickup_address" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "fulfillment_method" "FulfillmentMethod" NOT NULL DEFAULT 'delivery',
ADD COLUMN     "pickup_address" JSONB,
ALTER COLUMN "delivery_address_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
