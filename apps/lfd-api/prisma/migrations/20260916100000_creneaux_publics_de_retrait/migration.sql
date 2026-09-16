-- **Les créneaux du retrait public** — plan
-- `documentation/b2b/plan-creneaux-de-retrait.md`, D1, D2, D4, §3.
--
-- ## Additive, et c'est tout le sujet
--
-- Deux tables NEUVES, à côté de l'existant. Aucune colonne touchée, aucune
-- donnée convertie, aucun renommage : `pickup_addresses.opening` — les heures
-- PRO — n'est ni lue, ni écrite, ni déplacée par cette migration. C'est la
-- découpe qui rend ce chantier sûr (§3) : la première version du plan
-- remplaçait `opening` par une table de règles, et ce merge-là aurait détruit
-- le seul exemplaire d'un réglage servi en production.
--
-- Après cette migration, **rien ne change pour personne** : un point sans
-- aucune règle publique se comporte exactement comme avant, à l'octet près (D6).
--
-- Retour arrière : `DROP TABLE "public"."public_pickup_closures";` puis
-- `DROP TABLE "public"."public_pickup_slot_rules";` — sans condition tant que
-- l'écran de saisie n'existe pas (lot B). Après, ce serait détruire l'horaire
-- public d'un comptoir, qu'il faudrait ressaisir à la main.
--
-- ## Trois choix qui se lisent ici
--
-- - **Aucun unique sur `(pickup_address_id, weekday)`**, contrairement à
--   `order_cutoffs` : PLUSIEURS règles par point et par jour est la fonction
--   même de cette table — c'est ce qui donne deux badges dans la même matinée
--   (D2). Le chevauchement entre règles est refusé par l'agrégat, et la course
--   entre deux administrateurs est assumée (D8).
-- - **Aucune colonne de capacité de stock.** `stock_capacity` est NOMMÉE dans le
--   plan et non portée : elle demande que le fournil sache dire ce qu'il a sorti,
--   ce qui n'existe pas. Une colonne qu'on ne saurait pas remplir serait une
--   dette, pas une préparation (D3).
-- - **`ON DELETE CASCADE` vers le point.** Une règle n'a aucun sens sans son
--   comptoir, et un point ne se supprime que s'il en reste un autre
--   (`LastPickupAddressError`). Rien ici n'est un agrégat métier durable dont la
--   suppression physique serait une perte : l'horaire se ressaisit.

-- CreateTable
CREATE TABLE "public"."public_pickup_slot_rules" (
    "id" TEXT NOT NULL,
    "pickup_address_id" TEXT NOT NULL,
    "weekday" TEXT,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_minutes" INTEGER NOT NULL,
    "badge" TEXT,
    "service_capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_pickup_slot_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."public_pickup_closures" (
    "id" TEXT NOT NULL,
    "pickup_address_id" TEXT NOT NULL,
    "from_day" DATE NOT NULL,
    "to_day" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_pickup_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_pickup_slot_rules_pickup_address_id_weekday_idx" ON "public"."public_pickup_slot_rules"("pickup_address_id", "weekday");

-- CreateIndex
CREATE INDEX "public_pickup_closures_pickup_address_id_from_day_idx" ON "public"."public_pickup_closures"("pickup_address_id", "from_day");

-- AddForeignKey
ALTER TABLE "public"."public_pickup_slot_rules" ADD CONSTRAINT "public_pickup_slot_rules_pickup_address_id_fkey" FOREIGN KEY ("pickup_address_id") REFERENCES "public"."pickup_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."public_pickup_closures" ADD CONSTRAINT "public_pickup_closures_pickup_address_id_fkey" FOREIGN KEY ("pickup_address_id") REFERENCES "public"."pickup_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
