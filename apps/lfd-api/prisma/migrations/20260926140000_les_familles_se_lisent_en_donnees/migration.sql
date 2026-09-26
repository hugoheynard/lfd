-- LES FAMILLES SE LISENT EN DONNÉES — une portée « famille » porte l'id du référentiel
--
-- Plan : documentation/pricing/plan-familles-en-donnees.md, « Lots 1 à 3 réunis », point 5.
--
-- Jusqu'ici, une décision de portée famille (`scope_type = 'category'`) portait
-- un CODE de rayon (`viennoiserie`, `pain`, `patisserie`, `sale`, `chocolat`),
-- traduit depuis la famille du PIM par une table en dur. La tarification compare
-- désormais l'id PIM de la famille, lu dans `catalog_categories`. Cette
-- migration reprend les lignes qui portent encore un code, dans les QUATRE
-- tables de portée famille — `price_rules`, `price_floors`, `volume_ladders`,
-- `volume_commitments` —, **archivées comprises** : la lecture datée relit une
-- décision archivée après l'instant lu, et une ligne restée en code cesserait de
-- s'appliquer au passé.
--
-- La correspondance passe par le SLUG, seul lien stable entre l'ancien code et
-- l'id : code → slug → l'id de `catalog_categories` qui porte ce slug, en
-- préférant l'id qui n'est pas un `cat_*` quand les deux coexistent (le miroir
-- ne supprime jamais une famille ; ses `cat_*` sont des orphelins).
--
-- 🔴 Elle ÉCHOUE, et nomme le code, si un code présent n'a pas de cible unique :
-- deviner une famille ferait mordre une règle de prix sur la mauvaise.
--
-- Elle ne touche PAS `pim.order_time_limit` : les heures limites portent déjà
-- l'id PIM, et suivent déjà la lignée.
--
-- ## En production
--
-- L'état des lieux lu par Hugo le 2026-09-26 (plan §5) : AUCUNE décision de
-- portée famille vivante, ni règle, ni limite, ni palier, ni engagement. Sur les
-- décisions vivantes, elle ne réécrit donc rien — c'est le premier test qu'elle
-- passe. Les archivées restaient « à mesurer » (plan, point 8) : s'il en existe
-- en code, elles sont reprises comme les autres, ou la migration échoue en
-- nommant le code orphelin.
--
-- ## Base de dev sans cible
--
-- Un miroir de dev jamais livré par le PIM n'a pas les slugs : la migration
-- échoue en nommant le code. Geste de sortie : relancer le catalogue par le bus,
-- puis rejouer les migrations —
--
--   pnpm --filter lfd-api seed:pim
--   pnpm --filter lfd-api exec prisma migrate deploy
--
-- ## Retour arrière
--
-- Gratuit tant que rien n'est sur `main`. Ensuite, une migration inverse
-- id → code (par le même slug), NON ÉCRITE : il faudrait aussi redéployer le
-- code qui lisait les codes.
--
-- Le journal tarifaire et les traces figées des lignes de commande gardent leurs
-- clés passées (immuables) : c'est `legacy-shelf-codes.ts` qui les lit.

DO $$
DECLARE
  legacy RECORD;
  targets TEXT[];
BEGIN
  CREATE TEMP TABLE legacy_shelf_code (code TEXT PRIMARY KEY, slug TEXT NOT NULL) ON COMMIT DROP;
  INSERT INTO legacy_shelf_code (code, slug) VALUES
    ('viennoiserie', 'viennoiseries'),
    ('pain', 'pains'),
    ('patisserie', 'patisseries'),
    ('sale', 'sale-traiteur'),
    ('chocolat', 'chocolat-confiserie');

  CREATE TEMP TABLE legacy_shelf_target (code TEXT PRIMARY KEY, family_id TEXT NOT NULL) ON COMMIT DROP;

  -- Les codes réellement présents, toutes tables et tous états confondus.
  FOR legacy IN
    SELECT DISTINCT l.code, l.slug
    FROM legacy_shelf_code l
    WHERE EXISTS (SELECT 1 FROM "public"."price_rules" t WHERE t."scope_type" = 'category' AND t."scope_id" = l.code)
       OR EXISTS (SELECT 1 FROM "public"."price_floors" t WHERE t."scope_type" = 'category' AND t."scope_id" = l.code)
       OR EXISTS (SELECT 1 FROM "public"."volume_ladders" t WHERE t."scope_type" = 'category' AND t."scope_id" = l.code)
       OR EXISTS (SELECT 1 FROM "public"."volume_commitments" t WHERE t."scope_type" = 'category' AND t."scope_id" = l.code)
  LOOP
    -- Les ids réels d'abord ; les `cat_*` seulement s'il n'y en a aucun.
    SELECT array_agg(c."id" ORDER BY c."id") INTO targets
    FROM "public"."catalog_categories" c
    WHERE c."slug" = legacy.slug AND c."id" NOT LIKE 'cat\_%';
    IF targets IS NULL THEN
      SELECT array_agg(c."id" ORDER BY c."id") INTO targets
      FROM "public"."catalog_categories" c
      WHERE c."slug" = legacy.slug;
    END IF;

    IF targets IS NULL THEN
      RAISE EXCEPTION 'Le code de rayon « % » est porté par des décisions de prix, mais aucune famille du miroir n''a le slug « % ». Livrer le catalogue depuis le référentiel (en dev : pnpm --filter lfd-api seed:pim), puis rejouer prisma migrate deploy.', legacy.code, legacy.slug;
    END IF;
    IF array_length(targets, 1) > 1 THEN
      RAISE EXCEPTION 'Le code de rayon « % » n''a pas de famille unique : le slug « % » est porté par % (%). Choisir la famille dans le référentiel, puis rejouer la migration.', legacy.code, legacy.slug, array_length(targets, 1), array_to_string(targets, ', ');
    END IF;

    INSERT INTO legacy_shelf_target (code, family_id) VALUES (legacy.code, targets[1]);
  END LOOP;

  UPDATE "public"."price_rules" t SET "scope_id" = m.family_id
  FROM legacy_shelf_target m WHERE t."scope_type" = 'category' AND t."scope_id" = m.code;
  UPDATE "public"."price_floors" t SET "scope_id" = m.family_id
  FROM legacy_shelf_target m WHERE t."scope_type" = 'category' AND t."scope_id" = m.code;
  UPDATE "public"."volume_ladders" t SET "scope_id" = m.family_id
  FROM legacy_shelf_target m WHERE t."scope_type" = 'category' AND t."scope_id" = m.code;
  UPDATE "public"."volume_commitments" t SET "scope_id" = m.family_id
  FROM legacy_shelf_target m WHERE t."scope_type" = 'category' AND t."scope_id" = m.code;
END $$;
