-- RETOUR ARRIÈRE de 20261127235000_les_favoris_au_planificateur
-- (documentation/commandes/planificateur/plan-planificateur-de-commandes.md, lot L4).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- L'index est additif : le code d'avant l'ignore. La table rendue est vide —
-- la liste d'envies qu'elle portait n'est pas restituée (elle n'a jamais
-- servi hors de dev).

DROP INDEX "recurring"."planned_columns_draft_converts_at_idx";

CREATE TABLE "recurring"."wishlist_items" (
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id", "company_id", "sku")
);
