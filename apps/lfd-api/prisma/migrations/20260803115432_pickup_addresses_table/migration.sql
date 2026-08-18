/*
  Warnings:

  - You are about to drop the column `pickup_address` on the `b2b_platform_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "b2b_platform_settings" DROP COLUMN "pickup_address";

-- CreateTable
CREATE TABLE "pickup_addresses" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ligne1" TEXT NOT NULL,
    "ligne2" TEXT NOT NULL DEFAULT '',
    "code_postal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "pays" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_addresses_pkey" PRIMARY KEY ("id")
);
