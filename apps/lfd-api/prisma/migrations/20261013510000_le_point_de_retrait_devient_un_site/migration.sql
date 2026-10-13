-- LE POINT DE RETRAIT DEVIENT UN SITE (Hugo, 2026-10-13)
--
-- Plan `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
-- lot S1 (§3.1, §3.3). La ligne `pickup_addresses` EST le site : la table
-- garde son nom (Q-S1 proposé), seul le modèle Prisma s'appelle `Site`.
-- Les références (`pickup_address_id`) et les snapshots ne bougent pas.
--
-- ADDITIVE : deux types, neuf colonnes, toutes à défaut ou nullables.
--   - `hands_over` défaut `true` : l'existant, où tout point remettait ;
--   - `supply` défaut `on_site`, `transfer_mode` défaut `integrated` ;
--   - `counter_setup_minutes` défaut 0 : aucune durée copiée d'un autre réglage ;
--   - `archived_at` : l'archivage remplace la suppression physique ;
--   - quatre couleurs `text NULL`, LIBRES (Hugo, 2026-10-13, pas de palette) :
--     la FORME `#rrggbb` est tenue ici par un CHECK, les teintes réservées aux
--     surligneurs OK / KO (vert, rouge, rose) par le value object `SiteColor`.
--     AUCUNE couleur n'est posée : l'écran les saisit, et le CHECK de présence
--     viendra au lot S3r.
--
-- UN FAIT, PAS UNE VALEUR INVENTÉE : le site d'où partent aujourd'hui les
-- tournées reçoit `dispatches = true`. C'est celui de `delivery_departure`
-- s'il a été choisi, sinon le site par défaut (la règle « ligne absente =
-- défaut » de la livraison). La lecture de `delivery.delivery_departure` est
-- UNIQUE et figée dans cette migration : le code du commerce, lui, ne lit
-- jamais cette table.
--
-- Retour arrière : supprimer les colonnes et les deux types. Rien d'existant
-- n'est modifié hormis `dispatches`, qui vient de naître.

CREATE TYPE "public"."site_supply" AS ENUM ('on_site', 'transfer');
CREATE TYPE "public"."site_transfer_mode" AS ENUM ('integrated', 'dedicated');

ALTER TABLE "public"."pickup_addresses"
  ADD COLUMN "hands_over" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "supply" "public"."site_supply" NOT NULL DEFAULT 'on_site',
  ADD COLUMN "dispatches" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMPTZ(3),
  ADD COLUMN "transfer_mode" "public"."site_transfer_mode" NOT NULL DEFAULT 'integrated',
  ADD COLUMN "counter_setup_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pickup_color_b2b" TEXT,
  ADD COLUMN "pickup_color_b2c" TEXT,
  ADD COLUMN "delivery_color_b2b" TEXT,
  ADD COLUMN "delivery_color_b2c" TEXT;

ALTER TABLE "public"."pickup_addresses"
  ADD CONSTRAINT "pickup_addresses_counter_setup_minutes_check"
    CHECK ("counter_setup_minutes" >= 0),
  ADD CONSTRAINT "pickup_addresses_pickup_color_b2b_check"
    CHECK ("pickup_color_b2b" ~ '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT "pickup_addresses_pickup_color_b2c_check"
    CHECK ("pickup_color_b2c" ~ '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT "pickup_addresses_delivery_color_b2b_check"
    CHECK ("delivery_color_b2b" ~ '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT "pickup_addresses_delivery_color_b2c_check"
    CHECK ("delivery_color_b2c" ~ '^#[0-9a-f]{6}$');

UPDATE "public"."pickup_addresses"
   SET "dispatches" = true
 WHERE "id" = COALESCE(
   (SELECT "pickup_address_id" FROM "delivery"."delivery_departure" WHERE "key" = 'departure'),
   (SELECT "id" FROM "public"."pickup_addresses"
     ORDER BY "is_default" DESC, "created_at" ASC LIMIT 1)
 );
