-- CreateEnum
CREATE TYPE "PaymentTerm" AS ENUM ('per_order', 'monthly', 'net60', 'net90');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "CustomerRole" AS ENUM ('company_admin', 'member');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "AddressKind" AS ENUM ('facturation', 'livraison');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'placed', 'confirmed', 'in_production', 'fulfilled', 'cancelled');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "raison_sociale" TEXT NOT NULL,
    "enseigne" TEXT NOT NULL DEFAULT '',
    "forme_juridique" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "tva_intracom" TEXT NOT NULL DEFAULT '',
    "contact_prenom" TEXT NOT NULL,
    "contact_nom" TEXT NOT NULL,
    "contact_fonction" TEXT NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL,
    "contact_telephone" TEXT NOT NULL DEFAULT '',
    "rep_prenom" TEXT,
    "rep_nom" TEXT,
    "rep_fonction" TEXT,
    "rep_email" TEXT,
    "rep_telephone" TEXT,
    "payment_term" "PaymentTerm" NOT NULL DEFAULT 'per_order',
    "status" "CompanyStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "auth0_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "CustomerRole" NOT NULL DEFAULT 'member',
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "company_id" TEXT NOT NULL,
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" "AddressKind" NOT NULL,
    "label" TEXT NOT NULL,
    "ligne1" TEXT NOT NULL,
    "ligne2" TEXT NOT NULL DEFAULT '',
    "code_postal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "pays" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "placed_by_user_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'placed',
    "requested_delivery_date" DATE,
    "delivery_address_id" TEXT NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_siret_idx" ON "companies"("siret");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0_sub_key" ON "users"("auth0_sub");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE INDEX "addresses_company_id_kind_idx" ON "addresses"("company_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_company_id_idx" ON "orders"("company_id");

-- CreateIndex
CREATE INDEX "orders_requested_delivery_date_idx" ON "orders"("requested_delivery_date");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_sku_idx" ON "order_lines"("sku");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_user_id_fkey" FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
