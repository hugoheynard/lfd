-- ───────────────────────────────────────────────────────────────────────────
-- Trois invariants d'unicité que le CODE affirmait et que la base ne tenait
-- pas. Chacun avait son erreur métier, son écran et son test — et une simple
-- lecture pour seule garde. Deux requêtes simultanées passaient au travers :
-- le résultat n'était pas une erreur mais un doublon silencieux.
--
-- Cf. documentation/pim/concurrence-et-allers-retours.md
--
-- Aucun de ces trois n'est exprimable dans `schema.prisma` (index
-- d'expression, `NULLS NOT DISTINCT`, index partiel). Ils vivent donc en SQL,
-- comme `price_rules_no_overlap` avant eux, et `schema.prisma` les signale au
-- lecteur. ⚠️ Une `prisma migrate dev` ultérieure proposera de les SUPPRIMER
-- (elle ne voit que le schéma) : refuser la ligne, comme pour l'exclusion
-- tarifaire.
--
-- Postgres 15+ requis pour `NULLS NOT DISTINCT`. Dev et prod tournent en 17.
--
-- Avant d'appliquer sur une base vivante, vérifier qu'aucun doublon n'existe
-- déjà — sinon la création échoue, ce qui est le bon comportement :
--
--   SELECT slug->>'fr', count(*) FROM pim.category GROUP BY 1 HAVING count(*) > 1;
--   SELECT parent_id, position, count(*) FROM pim.category
--     WHERE is_archived = false GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT lower(name), count(*) FROM pim.emplacement GROUP BY 1 HAVING count(*) > 1;
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Le slug d'une famille. La colonne est un `Json` localisé : l'unicité porte
--    sur la langue SOURCE, la seule dont un slug est dérivé aujourd'hui.
CREATE UNIQUE INDEX "category_slug_fr_unique" ON "pim"."category" (("slug" ->> 'fr'));

-- 2. Le rang dans une fratrie.
--
--    `NULLS NOT DISTINCT` : sans lui, les familles RACINE (parent_id NULL)
--    échapperaient à la contrainte — deux NULL sont distincts par défaut, donc
--    le premier niveau, celui qu'on voit en ouvrant l'écran, serait le seul non
--    protégé.
--
--    Partiel (`is_archived = false`) : une famille archivée garde son rang et
--    sort du réordonnancement. Sans ce filtre, un rang libéré par un archivage
--    resterait occupé par un fantôme, et renuméroter la fratrie vivante
--    échouerait sur une ligne que personne ne voit plus.
CREATE UNIQUE INDEX "category_sibling_rank_unique"
  ON "pim"."category" ("parent_id", "position")
  NULLS NOT DISTINCT
  WHERE "is_archived" = false;

-- 3. Le nom d'un emplacement, INSENSIBLE à la casse — comme la recherche que le
--    dépôt fait déjà en lecture. « Village » et « village » désignent le même
--    point de vente pour qui lit l'écran, et c'est l'écran qui compte.
CREATE UNIQUE INDEX "emplacement_name_unique" ON "pim"."emplacement" (lower("name"));
