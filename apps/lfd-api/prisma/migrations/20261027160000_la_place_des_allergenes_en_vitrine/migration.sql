-- LA PLACE DES ALLERGÈNES EN VITRINE — réglage global de la vitrine (Hugo,
-- 2026-10-27, `documentation/pim/plan-allergenes-en-boutique.md`).
--
-- ADDITIVE : une table neuve, rien de touché ailleurs. Aucune ligne semée :
-- absente, la boutique montre les allergènes sur la fiche ouverte seulement
-- (`sheet`). La contrainte borne la valeur aux deux places connues.

CREATE TABLE "public"."storefront_settings" (
    "id" TEXT NOT NULL,
    "allergen_display" TEXT NOT NULL DEFAULT 'sheet',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,

    CONSTRAINT "storefront_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storefront_settings_allergen_display_check"
        CHECK ("allergen_display" IN ('sheet', 'gallery'))
);
