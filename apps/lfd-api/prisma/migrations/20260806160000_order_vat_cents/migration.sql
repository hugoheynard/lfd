-- TVA de la commande (centimes). Prix marchandises HT ; `total_cents` devient le
-- TTC encaissé = max(0, subtotal − discount) + delivery_fee + vat.
ALTER TABLE "orders" ADD COLUMN "vat_cents" INTEGER NOT NULL DEFAULT 0;
