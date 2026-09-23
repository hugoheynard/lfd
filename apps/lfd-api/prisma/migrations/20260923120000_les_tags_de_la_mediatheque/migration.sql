-- Lot 4 de `documentation/mediatheque/plan-la-mediatheque.md` — nommer, taguer, pointer.
--
-- Les TAGS de la bibliothèque de visuels. Vocabulaire LIBRE et à PLAT : pas
-- d'arbre, pas de racine, pas de mot imposé à l'entrée (décision Hugo,
-- 2026-09-23 — « non pas de hiérarchie texte libre », puis « oublie le concept
-- racine »).
--
-- 🔴 UN TABLEAU, pas une table. Sans hiérarchie ni propriétés, une table de
-- tags n'apporterait qu'une jointure : rien à porter d'autre que le mot
-- lui-même. Le jour où un tag devra porter une couleur, une description ou un
-- parent, ce sera une décision à prendre — pas un regret.
--
-- Strictement ADDITIF : une colonne neuve, non nulle, avec son défaut. Aucune
-- ligne existante n'est touchée, et un retour arrière est un `DROP COLUMN`.
--
-- ⚠️ Le tableau est indexé en GIN : la recherche de la médiathèque filtrera par
-- `tags @> ARRAY[…]`, et un fonds de plusieurs milliers d'images ferait sans
-- lui un balayage complet à chaque frappe.
ALTER TABLE "pim"."media_asset"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "media_asset_tags_idx" ON "pim"."media_asset" USING GIN ("tags");
