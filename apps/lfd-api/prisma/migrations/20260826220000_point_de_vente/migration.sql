-- Le point de vente, tranche p-0 : ÉTENDRE.
--
-- Voir `documentation/pim/point-de-vente.md`. Elle crée l'entité dont
-- `emplacement` n'était qu'un cas, reprend les boutiques existantes et fait
-- exister la plateforme professionnelle — qui n'était jusqu'ici qu'un `NULL`
-- dans une colonne, donc visible nulle part à l'écran.
--
-- Elle ne DÉPLACE rien : `emplacement`, `click_collect`, `sur_place`,
-- `location_context` et `category_channel.location_id` restent écrits et lus.
-- p-1 branche la matrice, p-2 bascule les lectures, p-3 supprime
-- (`documentation/ops/pipelines.md`).

-- 1. Le genre. Une seule table plutôt que deux : la seule colonne réellement
-- propre à la boutique est `base_url`, et les tables vivent déjà dans la leur.
CREATE TYPE "pim"."point_of_sale_kind" AS ENUM ('shop', 'platform');

CREATE TABLE "pim"."point_of_sale" (
  "id"         TEXT NOT NULL,
  "kind"       "pim"."point_of_sale_kind" NOT NULL,
  "label"      TEXT NOT NULL,
  "base_url"   TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_of_sale_pkey" PRIMARY KEY ("id")
);

-- Le genre n'est pas une convention de lecture. Une plateforme n'a pas d'URL de
-- click & collect, une boutique en a toujours une (vide tant qu'on ne l'a pas
-- renseignée) : l'équivalence rend les deux états impossibles à inverser.
ALTER TABLE "pim"."point_of_sale"
  ADD CONSTRAINT "point_of_sale_shop_has_base_url"
  CHECK (("kind" = 'shop') = ("base_url" IS NOT NULL));

-- 2. Ce qu'il offre. Successeur de `location_context`, qui ne savait pas parler
-- de la plateforme faute de ligne pour elle.
CREATE TABLE "pim"."point_of_sale_context" (
  "point_of_sale_id" TEXT NOT NULL,
  "context_key"      TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_of_sale_context_pkey" PRIMARY KEY ("point_of_sale_id", "context_key")
);

CREATE INDEX "point_of_sale_context_context_key_idx"
  ON "pim"."point_of_sale_context" ("context_key");

ALTER TABLE "pim"."point_of_sale_context"
  ADD CONSTRAINT "point_of_sale_context_point_of_sale_id_fkey"
  FOREIGN KEY ("point_of_sale_id") REFERENCES "pim"."point_of_sale" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."point_of_sale_context"
  ADD CONSTRAINT "point_of_sale_context_context_key_fkey"
  FOREIGN KEY ("context_key") REFERENCES "pim"."sales_context" ("key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Reprise des boutiques. Elles GARDENT leur identifiant : la matrice cite
-- déjà `emplacement.id`, donc la reprise de p-1 sera une copie de colonne
-- plutôt qu'une jointure sur une table de correspondance.
INSERT INTO "pim"."point_of_sale" ("id", "kind", "label", "base_url")
SELECT "id", 'shop', "name", "base_url" FROM "pim"."emplacement"
ON CONFLICT DO NOTHING;

-- 4. La plateforme professionnelle EXISTE. C'est tout l'intérêt de cette
-- tranche : le B2B se lisait comme un `NULL` dans `category_channel`, une
-- absence qui portait du sens et qu'aucun écran ne pouvait montrer.
--
-- Elle est aussi semée au boot (`ensureRootPointOfSale`) : la migration ne
-- suffirait pas — supprimée en base, elle ne reviendrait jamais, et la boutique
-- professionnelle se viderait sans qu'une erreur soit levée.
INSERT INTO "pim"."point_of_sale" ("id", "kind", "label", "base_url")
VALUES ('pos_b2b', 'platform', 'B2B', NULL)
ON CONFLICT DO NOTHING;

-- 5. Reprise de l'offre. Les boutiques depuis `location_context` — déjà le
-- miroir de `click_collect` / `sur_place`, donc on ne relit pas les colonnes une
-- seconde fois. La plateforme offre le contexte racine, et lui seul.
INSERT INTO "pim"."point_of_sale_context" ("point_of_sale_id", "context_key")
SELECT "location_id", "context_key" FROM "pim"."location_context"
ON CONFLICT DO NOTHING;

INSERT INTO "pim"."point_of_sale_context" ("point_of_sale_id", "context_key")
SELECT 'pos_b2b', "key" FROM "pim"."sales_context" WHERE "key" = 'b2b'
ON CONFLICT DO NOTHING;
