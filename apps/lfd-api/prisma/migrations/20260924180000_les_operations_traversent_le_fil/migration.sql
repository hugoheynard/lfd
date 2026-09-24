-- LES OPÉRATIONS TRAVERSENT LE FIL — lot 2 du plan des opérations datées
--
-- Le référentiel marque ses articles « vendus seulement pendant une
-- opération » (D3), le fil v11 les transporte avec les opérations (D10), et le
-- commerce les reçoit dans un miroir qu'il peut restreindre à la réception (D9).
--
-- **Additif et sans effet à la pose** : deux colonnes à défaut `false` sur
-- deux tables servies, une colonne nullable sur les versions, trois tables
-- NEUVES et vides. Aucune colonne existante n'est modifiée, aucune ligne
-- réécrite. ⚠️ Jusqu'au lot 3, rien ne refuse de vente sur ces données.
--
-- Retour arrière, dans cet ordre :
--   DROP TABLE "public"."catalog_operation_overrides";
--   DROP TABLE "public"."catalog_operation_items";
--   DROP TABLE "public"."catalog_operations";
--   ALTER TABLE "public"."catalog_versions" DROP COLUMN "operations";
--   ALTER TABLE "public"."catalog_items" DROP COLUMN "operation_only";
--   ALTER TABLE "pim"."product" DROP COLUMN "operation_only";
-- ⚠️ Seulement tant qu'aucun envoi v11 n'a été accepté : le code v10 ne relit
-- pas un envoi v11 en attente (cf. « Sans retour » dans le plan).
--
-- Plan : documentation/order/architecture-operations-datees.md (D3, D9, D10)

-- ── 1. LA FICHE DU RÉFÉRENTIEL ─────────────────────────────────────────────
ALTER TABLE "pim"."product" ADD COLUMN "operation_only" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. LE MIROIR DES ARTICLES ──────────────────────────────────────────────
ALTER TABLE "public"."catalog_items" ADD COLUMN "operation_only" BOOLEAN NOT NULL DEFAULT false;

-- ── 3. LA PHOTOGRAPHIE D'UNE VERSION ───────────────────────────────────────
-- `NULL` = version posée avant la v11 : on ne sait pas, ce n'est pas « aucune ».
ALTER TABLE "public"."catalog_versions" ADD COLUMN "operations" JSONB;

-- ── 4. LE MIROIR DES OPÉRATIONS ────────────────────────────────────────────
-- Une opération disparue d'un envoi est MARQUÉE (`withdrawn_at`), jamais
-- supprimée : une clé ne se réemploie pas, et la surcharge garde son parent.
CREATE TABLE "public"."catalog_operations" (
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "lede" JSONB,
    "image_url" TEXT,
    "image_alt" TEXT,
    "announce_from" TIMESTAMPTZ(3) NOT NULL,
    "order_from" TIMESTAMPTZ(3),
    "order_until" TIMESTAMPTZ(3) NOT NULL,
    "pickup_from" DATE NOT NULL,
    "pickup_until" DATE NOT NULL,
    "audience" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),

    CONSTRAINT "catalog_operations_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "public"."catalog_operation_items" (
    "operation_key" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "catalog_operation_items_pkey" PRIMARY KEY ("operation_key","sku")
);

ALTER TABLE "public"."catalog_operation_items"
    ADD CONSTRAINT "catalog_operation_items_operation_key_fkey"
    FOREIGN KEY ("operation_key") REFERENCES "public"."catalog_operations"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 5. LA SURCHARGE À LA RÉCEPTION ─────────────────────────────────────────
-- Restreindre, jamais étendre (D9) : la clôture appliquée est `min(PIM,
-- surcharge)`, la clientèle l'intersection — calculées à la lecture.
CREATE TABLE "public"."catalog_operation_overrides" (
    "operation_key" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "order_until" TIMESTAMPTZ(3),
    "audience" TEXT,
    "hidden_skus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_operation_overrides_pkey" PRIMARY KEY ("operation_key"),
    -- La même liste fermée que l'agrégat : un `UPDATE` à la main passerait à
    -- côté de lui, pas de la base.
    CONSTRAINT "catalog_operation_overrides_audience_check"
        CHECK ("audience" IS NULL OR "audience" IN ('pro', 'public', 'both'))
);

ALTER TABLE "public"."catalog_operation_overrides"
    ADD CONSTRAINT "catalog_operation_overrides_operation_key_fkey"
    FOREIGN KEY ("operation_key") REFERENCES "public"."catalog_operations"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE;
