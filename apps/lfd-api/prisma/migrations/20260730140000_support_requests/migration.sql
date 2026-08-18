-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('phone', 'email');

-- CreateEnum
CREATE TYPE "SupportSlot" AS ENUM ('morning', 'afternoon');

-- CreateTable
CREATE TABLE "support_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "channel" "SupportChannel" NOT NULL,
    "phone_number" TEXT NOT NULL DEFAULT '',
    "asap" BOOLEAN NOT NULL DEFAULT true,
    "scheduled_date" DATE,
    "slot" "SupportSlot",
    "message" TEXT NOT NULL DEFAULT '',
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_requests_company_id_idx" ON "support_requests"("company_id");

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
