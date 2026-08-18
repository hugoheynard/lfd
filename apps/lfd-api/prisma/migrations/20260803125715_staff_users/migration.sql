-- CreateEnum
CREATE TYPE "StaffScope" AS ENUM ('commercial', 'comptabilite', 'admin');

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "scopes" "StaffScope"[],
    "auth0_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_auth0_id_key" ON "staff_users"("auth0_id");
