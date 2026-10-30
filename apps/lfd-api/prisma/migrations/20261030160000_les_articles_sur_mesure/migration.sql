-- LES ARTICLES SUR MESURE — le marqueur et la réservation (plan
-- `documentation/catalogue/plan-articles-sur-mesure.md`, § 4, lot L1a).
--
-- ADDITIVE : une table neuve, vide, et deux colonnes NOT NULL avec défaut sur
-- `catalog_item_overrides` — chaque ligne existante reçoit « pas sur mesure »
-- et « invisible aux autres pros », qui ne jouent pas sans réservation. Rien
-- de retiré, rien de renommé, aucune donnée convertie. Aucun droit accordé.
--
-- `company_id` est opaque, sans clé étrangère (convention de la mercuriale) ;
-- `sku` vise l'article en RESTRICT : un article n'est jamais supprimé
-- physiquement. `reserved_by` est au registre RGPD (`lint:rgpd-staff`).
--
-- Cette migration ne restreint RIEN : le mur qui lit la réservation est le
-- lot L1b.
--
-- Retour arrière : `DROP TABLE public.catalog_item_reservations`, puis les deux
-- colonnes et leur contrainte, une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

CREATE TABLE "public"."catalog_item_reservations" (
    "sku" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reserved_at" TIMESTAMPTZ(3) NOT NULL,
    "reserved_by" TEXT NOT NULL,

    CONSTRAINT "catalog_item_reservations_pkey" PRIMARY KEY ("sku","company_id")
);

CREATE INDEX "catalog_item_reservations_company_id_idx" ON "public"."catalog_item_reservations"("company_id");

ALTER TABLE "public"."catalog_item_reservations"
    ADD CONSTRAINT "catalog_item_reservations_sku_fkey" FOREIGN KEY ("sku")
    REFERENCES "public"."catalog_items"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."catalog_item_overrides"
    ADD COLUMN "is_made_to_order" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "reserved_visibility" TEXT NOT NULL DEFAULT 'hidden';

ALTER TABLE "public"."catalog_item_overrides"
    ADD CONSTRAINT "catalog_item_overrides_reserved_visibility"
    CHECK ("reserved_visibility" IN ('hidden', 'visible_locked'));
