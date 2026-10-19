-- LES FORMULES — la composition (2026-10-19)
--
-- Plan `documentation/formules/plan-les-formules.md`, lot F2a : une formule,
-- ses groupes ordonnés, les articles au choix de chaque groupe. ADDITIVE :
-- trois tables neuves, rien d'existant n'est touché.
--
-- Aucune colonne de prix : le prix viendra avec son lot. Le statut ne connaît
-- que `draft` et `withdrawn` ; `on_sale` s'ajoutera en élargissant le CHECK.
--
-- Pas de clé étrangère vers `catalog_items` : un article retiré ne doit pas
-- emporter une formule (le SKU est porté en texte, comme une sélection
-- d'opération).
--
-- Retour arrière : DROP des trois tables, dans l'ordre inverse — elles ne
-- sont lues par personne d'autre que `b2b/bundles/`.

CREATE TABLE "public"."bundles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "written_at" TIMESTAMPTZ(3) NOT NULL,
    "written_by" TEXT,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bundles_audience_check" CHECK ("audience" IN ('public')),
    CONSTRAINT "bundles_status_check" CHECK ("status" IN ('draft', 'withdrawn'))
);

CREATE TABLE "public"."bundle_groups" (
    "bundle_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "bundle_groups_pkey" PRIMARY KEY ("bundle_id","key")
);

-- La clé primaire (bundle_id, sku) : un article n'entre qu'une fois dans une
-- formule, tous groupes confondus — l'invariant de l'agrégat, tenu en base.
CREATE TABLE "public"."bundle_choices" (
    "bundle_id" TEXT NOT NULL,
    "group_key" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "bundle_choices_pkey" PRIMARY KEY ("bundle_id","sku")
);

CREATE UNIQUE INDEX "bundles_key_key" ON "public"."bundles"("key");

CREATE INDEX "bundle_choices_bundle_id_group_key_idx" ON "public"."bundle_choices"("bundle_id", "group_key");

ALTER TABLE "public"."bundle_groups" ADD CONSTRAINT "bundle_groups_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."bundle_choices" ADD CONSTRAINT "bundle_choices_bundle_id_group_key_fkey" FOREIGN KEY ("bundle_id", "group_key") REFERENCES "public"."bundle_groups"("bundle_id", "key") ON DELETE RESTRICT ON UPDATE CASCADE;
