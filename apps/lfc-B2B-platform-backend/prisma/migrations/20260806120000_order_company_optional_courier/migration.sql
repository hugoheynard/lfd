-- Commande « zéro friction » : companyId devient OPTIONNEL (la commande peut
-- n'appartenir qu'au client connecté), et le coursier porte une zone tarifée +
-- une adresse de livraison libre figée.

-- AlterTable : company_id nullable (le mur sans entreprise = placed_by_user_id).
ALTER TABLE "orders" ALTER COLUMN "company_id" DROP NOT NULL;

-- AlterTable : zone choisie (coursier) + adresse de livraison libre figée.
ALTER TABLE "orders" ADD COLUMN     "delivery_zone_id" TEXT,
ADD COLUMN     "delivery_address_snapshot" JSONB;

-- CreateIndex : lister les commandes personnelles par client.
CREATE INDEX "orders_placed_by_user_id_idx" ON "orders"("placed_by_user_id");
