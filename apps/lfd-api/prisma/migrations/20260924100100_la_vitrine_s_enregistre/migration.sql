-- LA VITRINE S'ENREGISTRE
--
-- Les pages composées de la boutique quittent l'état local de l'éditeur. Six
-- tables NEUVES, qui ne portent rien d'autre : les supprimer rend l'état
-- d'avant. Et le droit `b2b_storefront` accordé à `admin` et `communication`.
--
-- 🔴 Suit `20260924100000_la_vitrine_a_son_droit`, qui ajoute la valeur d'enum :
-- appliquer celle-ci sans l'autre échoue.
--
-- La collision de deux objets n'est dans AUCUN CHECK : la base ne sait pas dire
-- « deux rectangles ne se recouvrent pas sur un même rayon ». C'est la règle de
-- l'agrégat `Storefront`. Ce qui est ici, ce sont les bornes qu'une ligne seule
-- peut dire — écrites en toutes lettres, jamais par `<>` ni `NOT (…)` sur une
-- colonne nullable, où NULL rendrait le CHECK muet.
--
-- Plan : documentation/order/plan-vitrine-enregistrement.md (D3, D6, D7)

-- ── 1. LA VITRINE, ET SA RÉVISION ──────────────────────────────────────────
--
-- Une seule ligne, `id = 'main'`, et AUCUNE semée : une vitrine absente se lit
-- `{ revision: 0 }`, et le premier enregistrement l'insère par l'upsert
-- conditionnel qui sert de verrou (D6).
CREATE TABLE "public"."storefront" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,

    CONSTRAINT "storefront_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storefront_single" CHECK ("id" = 'main'),
    CONSTRAINT "storefront_revision" CHECK ("revision" >= 1)
);

-- ── 2. LES PAGES ───────────────────────────────────────────────────────────
CREATE TABLE "public"."storefront_page" (
    "shelf_key" TEXT NOT NULL,
    "rows" SMALLINT NOT NULL,

    CONSTRAINT "storefront_page_pkey" PRIMARY KEY ("shelf_key"),
    CONSTRAINT "storefront_page_shelf_key" CHECK (length("shelf_key") > 0),
    CONSTRAINT "storefront_page_rows" CHECK ("rows" BETWEEN 1 AND 12)
);

-- ── 3. LES OBJETS ──────────────────────────────────────────────────────────
--
-- `tone` (Hugo, 2026-09-24) : `light` (papier crème, cerne or ; défaut),
-- `dark` (encre noire), `accent` (encre bleue). La colonne existe sur TOUS les
-- objets, un produit en carte 1×1 compris : c'est le rendu qui l'ignore
-- (`toneApplies`), pas la base qui la refuse.
--
-- Les listes fermées sont celles de `@lfd/storefront-layout`. Une forme
-- ajoutée là-bas demandera une migration ici : c'est voulu, une forme que la
-- base accepterait sans que la boutique sache la rendre serait pire.
CREATE TABLE "public"."storefront_object" (
    "id" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "col" SMALLINT NOT NULL,
    "row" SMALLINT NOT NULL,
    "apply_on_mobile" BOOLEAN NOT NULL,
    "media_fit" TEXT NOT NULL,
    "media_side" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL,
    "nav" TEXT NOT NULL,
    "autoplay" BOOLEAN NOT NULL,
    "interval_s" SMALLINT NOT NULL,
    "first_s" SMALLINT NOT NULL,
    "sample_count" SMALLINT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'light',
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "storefront_object_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storefront_object_shape" CHECK ("shape" IN ('card', 'kakemono', 'tile', 'block', 'hero', 'band', 'doubleBand')),
    CONSTRAINT "storefront_object_col" CHECK ("col" BETWEEN 1 AND 5),
    CONSTRAINT "storefront_object_row" CHECK ("row" >= 1),
    CONSTRAINT "storefront_object_media_fit" CHECK ("media_fit" IN ('cover', 'contain')),
    CONSTRAINT "storefront_object_media_side" CHECK ("media_side" IN ('left', 'right', 'top', 'full')),
    CONSTRAINT "storefront_object_nav" CHECK ("nav" IN ('dots', 'arrows', 'both')),
    CONSTRAINT "storefront_object_interval_s" CHECK ("interval_s" BETWEEN 3 AND 15),
    CONSTRAINT "storefront_object_first_s" CHECK ("first_s" BETWEEN 3 AND 30),
    CONSTRAINT "storefront_object_sample_count" CHECK ("sample_count" BETWEEN 2 AND 6),
    CONSTRAINT "storefront_object_tone" CHECK ("tone" IN ('light', 'dark', 'accent'))
);

-- ── 4. LES RAYONS D'UN OBJET ───────────────────────────────────────────────
--
-- `shelf_key` sans clé étrangère, ni vers `storefront_page` ni vers le
-- référentiel : c'est une chaîne opaque (§1). L'agrégat exige qu'un rayon
-- porté par un objet ait sa page.
CREATE TABLE "public"."storefront_object_shelf" (
    "object_id" TEXT NOT NULL,
    "shelf_key" TEXT NOT NULL,

    CONSTRAINT "storefront_object_shelf_pkey" PRIMARY KEY ("object_id","shelf_key"),
    CONSTRAINT "storefront_object_shelf_shelf_key" CHECK (length("shelf_key") > 0)
);

CREATE INDEX "storefront_object_shelf_shelf_key_idx" ON "public"."storefront_object_shelf"("shelf_key");

ALTER TABLE "public"."storefront_object_shelf" ADD CONSTRAINT "storefront_object_shelf_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."storefront_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 5. LES CONTENUS ────────────────────────────────────────────────────────
--
-- Un produit ne porte QUE son SKU (D4) : le prix recopié dériverait. Une info
-- porte au moins un titre. Les deux égalités disent les deux sens à la fois —
-- un produit sans SKU ET un SKU sur une info sont refusés.
CREATE TABLE "public"."storefront_content" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "kind" TEXT NOT NULL,
    "product_sku" TEXT,
    "badge" JSONB,
    "title" JSONB,
    "lede" JSONB,
    "image_url" TEXT,
    "image_alt" JSONB,
    "link_shelf_key" TEXT,

    CONSTRAINT "storefront_content_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storefront_content_position" CHECK ("position" >= 0),
    CONSTRAINT "storefront_content_kind" CHECK ("kind" IN ('product', 'info')),
    CONSTRAINT "storefront_content_product_sku" CHECK (("kind" = 'product') = ("product_sku" IS NOT NULL)),
    CONSTRAINT "storefront_content_info_title" CHECK (("kind" = 'info') = ("title" IS NOT NULL)),
    CONSTRAINT "storefront_content_product_only_sku" CHECK (
      "kind" = 'info'
      OR ("badge" IS NULL AND "lede" IS NULL AND "image_url" IS NULL AND "image_alt" IS NULL AND "link_shelf_key" IS NULL)
    ),
    CONSTRAINT "storefront_content_alt_with_image" CHECK ("image_alt" IS NULL OR "image_url" IS NOT NULL),
    CONSTRAINT "storefront_content_badge_object" CHECK ("badge" IS NULL OR jsonb_typeof("badge") = 'object'),
    CONSTRAINT "storefront_content_title_object" CHECK ("title" IS NULL OR jsonb_typeof("title") = 'object'),
    CONSTRAINT "storefront_content_lede_object" CHECK ("lede" IS NULL OR jsonb_typeof("lede") = 'object'),
    CONSTRAINT "storefront_content_image_alt_object" CHECK ("image_alt" IS NULL OR jsonb_typeof("image_alt") = 'object')
);

CREATE UNIQUE INDEX "storefront_content_object_id_position_key" ON "public"."storefront_content"("object_id", "position");

ALTER TABLE "public"."storefront_content" ADD CONSTRAINT "storefront_content_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."storefront_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 6. LES GABARITS ────────────────────────────────────────────────────────
--
-- `name_key` : le nom sans casse, sans accents, sans espaces autour
-- (`templateNameKey`) — « Noël » et « noel » ne coexistent pas.
CREATE TABLE "public"."storefront_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "description" TEXT,
    "shape" TEXT NOT NULL,
    "apply_on_mobile" BOOLEAN NOT NULL,
    "media_fit" TEXT NOT NULL,
    "media_side" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL,
    "nav" TEXT NOT NULL,
    "autoplay" BOOLEAN NOT NULL,
    "interval_s" SMALLINT NOT NULL,
    "first_s" SMALLINT NOT NULL,
    "sample_count" SMALLINT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'light',

    CONSTRAINT "storefront_template_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storefront_template_name" CHECK (length("name") BETWEEN 1 AND 60),
    CONSTRAINT "storefront_template_description" CHECK ("description" IS NULL OR length("description") BETWEEN 1 AND 280),
    CONSTRAINT "storefront_template_shape" CHECK ("shape" IN ('card', 'kakemono', 'tile', 'block', 'hero', 'band', 'doubleBand')),
    CONSTRAINT "storefront_template_media_fit" CHECK ("media_fit" IN ('cover', 'contain')),
    CONSTRAINT "storefront_template_media_side" CHECK ("media_side" IN ('left', 'right', 'top', 'full')),
    CONSTRAINT "storefront_template_nav" CHECK ("nav" IN ('dots', 'arrows', 'both')),
    CONSTRAINT "storefront_template_interval_s" CHECK ("interval_s" BETWEEN 3 AND 15),
    CONSTRAINT "storefront_template_first_s" CHECK ("first_s" BETWEEN 3 AND 30),
    CONSTRAINT "storefront_template_sample_count" CHECK ("sample_count" BETWEEN 2 AND 6),
    CONSTRAINT "storefront_template_tone" CHECK ("tone" IN ('light', 'dark', 'accent'))
);

CREATE UNIQUE INDEX "storefront_template_name_key_key" ON "public"."storefront_template"("name_key");

-- ── 7. LE DROIT, DANS LA TABLE DES RÔLES ───────────────────────────────────
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` doivent dire la même chose : la
-- table est ce que l'écran des rôles lit et édite, le contrat ce que le guard
-- résout. Sans ces deux UPDATE, l'écran montrerait une communication sans
-- vitrine alors que la route la laisse passer — et les e2e ne le verraient
-- pas : ils réécrivent la table depuis le code à chaque `reset()`. Un test
-- rejoue ces deux instructions (`test/storefront-roles-migration.e2e-spec.ts`).
--
-- ⚠️ Le guard lit `ROLE_GRANTS` (`resolveStaffPermissions`,
-- `staff/permissions/prisma-staff-access.resolver.ts`, vérifié le 2026-09-24),
-- pas cette table — contrairement à ce qu'écrit `20260923200100`.
--
-- ⚠️ Idempotents : on n'ajoute que si la ressource n'y est pas déjà. Un
-- tableau `jsonb` accepte les doublons sans rien dire, et
-- `resolveStaffPermissions` les lirait deux fois.
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_storefront","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_storefront'
  );

UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_storefront","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'communication'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_storefront'
  );

-- ── 8. RETOUR ARRIÈRE ──────────────────────────────────────────────────────
--
-- Les six tables se suppriment sans rien emporter d'autre. Les droits : un
-- UPDATE qui retire l'entrée `b2b_storefront` des deux rôles. La valeur d'enum,
-- elle, reste (migration précédente).
