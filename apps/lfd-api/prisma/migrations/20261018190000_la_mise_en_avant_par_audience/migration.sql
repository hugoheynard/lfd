-- La mise en avant PAR AUDIENCE (Hugo, 2026-10-18 : « on peut mettre en avant
-- public et pro »). Un article peut être un incontournable chez les pros, en
-- boutique publique, ou des deux côtés.
--
-- ## Ce que la migration RECOPIE
--
-- Chaque `is_featured = true` existant devient une mise en avant pour CHAQUE
-- audience que l'article sert : `catalog_items.audience` contient le lecteur
-- (`NULL` est lu `both`, comme le fait `servedTo`), et l'article n'est pas
-- masqué pour lui. Un article masqué d'un côté ne reçoit pas la mise en avant
-- de ce côté-là : l'agrégat refuse désormais ce couple, et masquer l'éteint.
--
-- Les articles retirés de la vente sont recopiés aussi (la jointure porte sur
-- `catalog_items` entier) : leur décision les attend s'ils reviennent.
--
-- ## Ce qu'elle ne fait PAS
--
-- `is_featured` reste en base, intacte : colonne morte, ni lue ni écrite par
-- le code. Rien ne se supprime sans ordre (CLAUDE.md §0).
--
-- Rejouable : les colonnes ne sont ajoutées que si elles manquent, et les
-- recopies ne font que lever des drapeaux (le test la rejoue sur la base
-- jetable, `test/featured-by-audience-migration.e2e-spec.ts`).
ALTER TABLE "public"."catalog_item_overrides"
  ADD COLUMN IF NOT EXISTS "is_featured_pro" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_featured_public" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."catalog_item_overrides" AS o
  SET "is_featured_pro" = true
  FROM "public"."catalog_items" AS i
  WHERE i."sku" = o."sku"
    AND o."is_featured" = true
    AND o."is_hidden" = false
    AND (i."audience" IS NULL OR i."audience" IN ('pro', 'both'));

UPDATE "public"."catalog_item_overrides" AS o
  SET "is_featured_public" = true
  FROM "public"."catalog_items" AS i
  WHERE i."sku" = o."sku"
    AND o."is_featured" = true
    AND o."is_hidden_public" = false
    AND (i."audience" IS NULL OR i."audience" IN ('public', 'both'));
