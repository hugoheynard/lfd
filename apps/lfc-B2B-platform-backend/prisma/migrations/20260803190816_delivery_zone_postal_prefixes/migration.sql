/*
  Warnings:

  - You are about to drop the column `code_postal` on the `delivery_zones` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "delivery_zones_code_postal_key";

-- AlterTable
ALTER TABLE "delivery_zones" DROP COLUMN "code_postal",
ADD COLUMN     "postal_prefixes" TEXT[];
