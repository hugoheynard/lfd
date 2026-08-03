-- CreateEnum
CREATE TYPE "PieceMode" AS ENUM ('hidden', 'optional', 'required');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "activated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "b2b_platform_settings" (
    "id" TEXT NOT NULL,
    "tva_mode" "PieceMode" NOT NULL DEFAULT 'required',
    "kbis_mode" "PieceMode" NOT NULL DEFAULT 'optional',
    "billing_mode" "PieceMode" NOT NULL DEFAULT 'required',
    "delivery_mode" "PieceMode" NOT NULL DEFAULT 'hidden',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "b2b_platform_settings_pkey" PRIMARY KEY ("id")
);
