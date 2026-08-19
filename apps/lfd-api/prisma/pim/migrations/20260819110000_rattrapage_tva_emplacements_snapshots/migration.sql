-- Rattrapage : quatre fonctionnalités du référentiel étaient en base sans jamais
-- avoir eu de migration — régimes de TVA, emplacements et QR de table, snapshots
-- de publication Shopify, présélection de canal sur les familles. Elles avaient
-- été posées par `db push`, si bien que le schéma n'était plus reproductible :
-- une base neuve construite depuis l'historique n'avait pas ces tables.
--
-- Découvert en murant le référentiel (B2d) : le premier test e2e à toucher cette
-- base a échoué sur `schema_out_of_sync`. C'est exactement ce que ce garde-fou
-- existe pour dire, et personne ne l'avait entendu parce que rien n'y touchait.
--
-- **Rejouable** (`IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`) : les bases
-- de développement et de production portent DÉJÀ ces objets. Sans cette
-- précaution, la reprise échouerait là où elle n'a rien à faire.
DO $$ BEGIN
  CREATE TYPE "ShopifyChannelMode" AS ENUM ('live', 'dry_run');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ShopifyPushOutcome" AS ENUM ('pushed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "channel_preset" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "emporter_tva_id" TEXT,
ADD COLUMN IF NOT EXISTS "sur_place_tva_id" TEXT;

-- AlterTable
ALTER TABLE "shopify_product_binding" ADD COLUMN IF NOT EXISTS "head_snapshot_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tva_regime" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "percent" DOUBLE PRECISION NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tva_regime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "emplacement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "click_collect" BOOLEAN NOT NULL DEFAULT false,
    "sur_place" BOOLEAN NOT NULL DEFAULT false,
    "base_url" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "emplacement_table" (
    "emplacement_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "qr_created" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,

    CONSTRAINT "emplacement_table_pkey" PRIMARY KEY ("emplacement_id","number")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "shopify_push_snapshot" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "mode" "ShopifyChannelMode" NOT NULL,
    "outcome" "ShopifyPushOutcome" NOT NULL,
    "pushed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_push_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tva_regime_tag_key" ON "tva_regime"("tag");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shopify_push_snapshot_handle_idx" ON "shopify_push_snapshot"("handle");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "shopify_push_snapshot_handle_version_key" ON "shopify_push_snapshot"("handle", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "category_emporter_tva_id_idx" ON "category"("emporter_tva_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "category_sur_place_tva_id_idx" ON "category"("sur_place_tva_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "category" ADD CONSTRAINT "category_emporter_tva_id_fkey" FOREIGN KEY ("emporter_tva_id") REFERENCES "tva_regime"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "category" ADD CONSTRAINT "category_sur_place_tva_id_fkey" FOREIGN KEY ("sur_place_tva_id") REFERENCES "tva_regime"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "emplacement_table" ADD CONSTRAINT "emplacement_table_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

