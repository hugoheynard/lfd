-- LA FLOTTE ET LE DÉPART — les bases paramétrables de la livraison
-- (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 2).
--
-- Purement ADDITIVE : deux tables neuves dans `production` (Q10 — pas de
-- schéma Postgres neuf, précédent `order_handover`), une colonne nullable sur
-- `public.pickup_addresses` (Q9), un index unique partiel.
--
-- Retour arrière : `DROP TABLE` des deux tables (vides avant le premier geste)
-- et `DROP COLUMN "gps"` — à ne faire qu'avant qu'un point GPS ait été saisi.

-- ─── Les points de retrait gagnent un point GPS facultatif ────────────────
-- `NULL` pour tous les points existants : personne ne l'a encore saisi, et
-- l'écran du départ le dit plutôt que d'inventer une position.
ALTER TABLE "public"."pickup_addresses" ADD COLUMN "gps" JSONB;

-- ─── La flotte ─────────────────────────────────────────────────────────────
CREATE TABLE "production"."delivery_vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_vehicle_pkey" PRIMARY KEY ("id")
);

-- Deux véhicules EN SERVICE ne portent pas la même plaque ; un véhicule retiré
-- libère la sienne. Partiel : une unicité pleine interdirait de remettre en
-- service une plaque revendue puis rachetée. Prisma ne sait pas l'exprimer :
-- il n'apparaît pas dans le schéma. `plate` est déjà la forme normalisée
-- (`LicensePlate`) — l'index compare ce que le domaine a écrit.
CREATE UNIQUE INDEX "delivery_vehicle_active_plate_key" ON "production"."delivery_vehicle"("plate") WHERE "retired_at" IS NULL;

-- ─── Le point de départ des tournées ──────────────────────────────────────
-- `pickup_address_id` est opaque : AUCUNE clé étrangère vers
-- `public.pickup_addresses`, qui appartient au commerce.
CREATE TABLE "production"."delivery_departure" (
    "key" TEXT NOT NULL,
    "pickup_address_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "delivery_departure_pkey" PRIMARY KEY ("key")
);
