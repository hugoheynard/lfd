-- Paniers récurrents (abonnements) : gabarit de commande répété, mur = user.
CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "placed_by_user_id" TEXT NOT NULL,
  "from_order_id" TEXT,
  "recurrence" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "fulfillment_method" "FulfillmentMethod" NOT NULL,
  "delivery_address_snapshot" JSONB,
  "pickup_address_id" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_placed_by_user_id_idx" ON "subscriptions"("placed_by_user_id");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_placed_by_user_id_fkey"
  FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "subscription_lines" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "subscription_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_lines_subscription_id_idx" ON "subscription_lines"("subscription_id");

ALTER TABLE "subscription_lines"
  ADD CONSTRAINT "subscription_lines_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
