-- RETOUR ARRIÈRE de 20261030100000_le_journal_parle_la_reference_de_vente
-- (documentation/catalogue/plan-defaut-sous-sa-reference.md, § 16).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE, AVEC le retour arrière de la bascule
-- (`20261029180000_le_defaut_se_vend_sous_sa_reference.sql`, même dossier) :
-- le code d'avant la bascule lit `PAI-001`, dans le journal comme ailleurs.
-- Le geste entier : documentation/ops/runbook.md, « Avant de déployer la
-- bascule du défaut ».
--
-- La MÊME réécriture, carte inversée (`PAI-001-1 → PAI-001`), aux mêmes
-- chemins. Comme pour la bascule, rien ne distingue un fait réécrit d'un
-- fait écrit APRÈS elle sous `-1` : les deux repassent sous `PAI-001`, ce que
-- le code d'avant attend. Le retour n'est donc sans surprise que tant
-- qu'aucun fait n'a été écrit sous `-1` APRÈS la bascule — même réserve que
-- celui de la 180000 : au-delà, des faits nés sous `-1` passeraient sous
-- `PAI-001`. La migration reste inscrite « appliquée » : ne pas la résoudre.

-- Le journal est écrit par presque chaque geste : mieux vaut un déploiement
-- qui échoue proprement en 5 s qu'une file de gestes bloqués.
SET lock_timeout = '5s';

BEGIN;

CREATE TEMP TABLE switch_map ON COMMIT DROP AS
  SELECT i.sku AS ref, i.product_sku AS target
    FROM public.catalog_items i
   WHERE i.is_default
     AND i.product_sku <> i.sku
     AND NOT EXISTS (SELECT 1 FROM public.catalog_items s WHERE s.sku = i.product_sku);

-- Ce qui ne doit plus rester : la référence de vente de chaque défaut.
CREATE TEMP TABLE switch_product_refs ON COMMIT DROP AS
  SELECT ref FROM switch_map;

-- L'inventaire : un type de fait (motif LIKE) et un chemin dans sa charge.
-- `*` = chaque élément d'une liste.
-- `only_when` : un prédicat jsonpath sur la charge, quand le chemin n'est une
-- référence que pour un genre de fait. Les motifs s'écrivent `\_` (ESCAPE).
CREATE TEMP TABLE journal_sku_paths (type_pattern text NOT NULL, path text[] NOT NULL,
                                     only_when jsonpath)
  ON COMMIT DROP;
INSERT INTO journal_sku_paths (type_pattern, path, only_when) VALUES
  -- commerce.ts. NI `catalog_item.*` NI `catalog_price_history.retraced` : ils
  -- ont toujours porté la référence de DÉCLINAISON (sujet = `item.sku` ;
  -- l'historique des prix est clé par `catalog_items.sku`), vérifié le
  -- 2026-10-30. `excludedSkus` reste : il recopie `catalog_versions.excluded_skus`,
  -- que la bascule a dû réécrire — il a donc pu porter une référence produit.
  ('catalog\_operation.override\_set', '{hiddenSkus,*}', NULL),
  ('catalog\_delivery.accepted', '{excludedSkus,*}', NULL),
  -- commerce-operations.ts, referential-operations.ts
  ('catalog\_operation.restriction\_carried\_over', '{hiddenSkus,*}', NULL),
  ('catalog\_operation.selection\_saved', '{skus,from,*}', NULL),
  ('catalog\_operation.selection\_saved', '{skus,to,*}', NULL),
  ('operation.selection\_saved', '{skus,from,*}', NULL),
  ('operation.selection\_saved', '{skus,to,*}', NULL),
  -- commerce-suggestions.ts : à la création, le déclencheur dit si `triggerRef` est un
  -- article ; une révision ne porte `trigger` que s'il change, d'où aucun filtre là —
  -- un id de famille n'est jamais une référence produit.
  ('staff\_suggestion.created', '{skus,*}', NULL),
  ('staff\_suggestion.created', '{triggerRef}', '$.trigger == "product_in_cart" || $.trigger == "product_viewed"'),
  ('staff\_suggestion.revised', '{changes,skus,from,*}', NULL),
  ('staff\_suggestion.revised', '{changes,skus,to,*}', NULL),
  ('staff\_suggestion.revised', '{changes,triggerRef,from}', NULL),
  ('staff\_suggestion.revised', '{changes,triggerRef,to}', NULL),
  -- commerce-bundles.ts
  ('bundle.created', '{groups,*,choices,*}', NULL),
  ('bundle.composition\_saved', '{groups,from,*,choices,*}', NULL),
  ('bundle.composition\_saved', '{groups,to,*,choices,*}', NULL),
  -- accounts.ts
  ('subscription.occurrence\_overridden', '{before,lines,*,sku}', NULL),
  ('subscription.occurrence\_overridden', '{after,lines,*,sku}', NULL),
  ('subscription.deleted', '{lines,*,sku}', NULL),
  -- after-close-revisions.ts, after-close-withdrawals.ts
  ('production\_day.order\_quantities\_raised', '{lines,*,sku}', NULL),
  ('packing\_sheet.revised', '{lines,*,sku}', NULL),
  ('packing\_sheet.withdrawn', '{released,*,sku}', NULL),
  -- packing-containers.ts, packing-reserve.ts
  ('packing\_container.filled', '{sku}', NULL),
  ('packing\_container.emptied', '{sku}', NULL),
  ('packing\_stock.sent\_to\_shop', '{lines,*,sku}', NULL),
  -- order-shortfalls.ts
  ('order.shortfall\_decided', '{departing,*,sku}', NULL),
  -- production-settings.ts, orders-production.ts
  ('production\_batch\_shortcut.%', '{sku}', NULL),
  ('production\_quality.%', '{target,sku}', NULL),
  ('production\_quality.%', '{subjectLabel}', '$.target.kind == "line"'),
  ('production\_container.%', '{subjectLabel}', NULL),
  -- delivery-bins.ts
  ('delivery\_bin\_capacity.set', '{sku}', NULL),
  -- pricing.ts : `scopeId` d'une portée `product` / `variant`.
  ('volume\_commitment.signed', '{scopeId}', '$.scope == "product" || $.scope == "variant"');

-- Réécrit, au chemin donné, la chaîne qui est sur la carte (inversée).
CREATE FUNCTION pg_temp.rewrite_at(j jsonb, path text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  head text := path[1];
  rest text[] := path[2:];
BEGIN
  IF j IS NULL THEN
    RETURN NULL;
  ELSIF head IS NULL THEN
    IF jsonb_typeof(j) = 'string' THEN
      RETURN COALESCE((SELECT to_jsonb(m.target) FROM switch_map m WHERE m.ref = j #>> '{}'), j);
    END IF;
    RETURN j;
  ELSIF head = '*' THEN
    IF jsonb_typeof(j) <> 'array' THEN
      RETURN j;
    END IF;
    RETURN (SELECT COALESCE(jsonb_agg(pg_temp.rewrite_at(e, rest) ORDER BY n), '[]'::jsonb)
              FROM jsonb_array_elements(j) WITH ORDINALITY AS t(e, n));
  ELSIF jsonb_typeof(j) = 'object' AND j ? head THEN
    RETURN jsonb_set(j, ARRAY[head], pg_temp.rewrite_at(j -> head, rest));
  END IF;
  RETURN j;
END
$$;

-- Le jumeau qui COMPTE, au même chemin, ce qui reste à rendre.
CREATE FUNCTION pg_temp.refs_at(j jsonb, path text[]) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE
  head text := path[1];
  rest text[] := path[2:];
BEGIN
  IF j IS NULL THEN
    RETURN 0;
  ELSIF head IS NULL THEN
    IF jsonb_typeof(j) = 'string' THEN
      RETURN (SELECT count(*) FROM switch_product_refs p WHERE p.ref = j #>> '{}');
    END IF;
    RETURN 0;
  ELSIF head = '*' THEN
    IF jsonb_typeof(j) <> 'array' THEN
      RETURN 0;
    END IF;
    RETURN (SELECT COALESCE(sum(pg_temp.refs_at(e, rest)), 0)
              FROM jsonb_array_elements(j) AS t(e));
  ELSIF jsonb_typeof(j) = 'object' AND j ? head THEN
    RETURN pg_temp.refs_at(j -> head, rest);
  END IF;
  RETURN 0;
END
$$;

-- 1. Les charges, chemin par chemin.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT * FROM journal_sku_paths LOOP
    UPDATE growth.activity_events e
       SET payload = pg_temp.rewrite_at(e.payload, c.path)
     WHERE e.type LIKE c.type_pattern ESCAPE '\'
       AND (c.only_when IS NULL OR e.payload @@ c.only_when)
       AND pg_temp.refs_at(e.payload, c.path) > 0;
  END LOOP;
END
$$;

-- 2. Le libellé d'un raccourci du fournil : « 1 plaque (VIE-001) ».
UPDATE growth.activity_events e
   SET payload = jsonb_set(e.payload, '{subjectLabel}',
                           to_jsonb(format('%s (%s)', e.payload ->> 'label', m.target)))
  FROM switch_map m
 WHERE e.type LIKE 'production\_batch\_shortcut.%' ESCAPE '\'
   AND e.payload ->> 'subjectLabel' = format('%s (%s)', e.payload ->> 'label', m.ref);

-- 3. Les sujets qui SONT une référence.
UPDATE growth.activity_events e SET subject_id = m.target
  FROM switch_map m
 WHERE e.subject_type = 'production_container' AND e.subject_id = m.ref;

UPDATE growth.activity_events e
   SET subject_id = regexp_replace(e.subject_id, '^((public:)?(product|variant):).*$', '\1') || m.target
  FROM switch_map m
 WHERE e.subject_type IN ('floor', 'price_floor')
   AND e.subject_id ~ '^(public:)?(product|variant):'
   AND regexp_replace(e.subject_id, '^(public:)?(product|variant):', '') = m.ref;

-- 4. LE CONTRÔLE DE FIN : aucune référence de défaut ne reste aux chemins inventoriés.
DO $$
DECLARE
  c record;
  found bigint;
  report text := '';
BEGIN
  FOR c IN SELECT * FROM journal_sku_paths LOOP
    SELECT COALESCE(sum(pg_temp.refs_at(e.payload, c.path)), 0) INTO found
      FROM growth.activity_events e
     WHERE e.type LIKE c.type_pattern ESCAPE '\'
       AND (c.only_when IS NULL OR e.payload @@ c.only_when);
    IF found > 0 THEN
      report := report || format('%s × %s %s ; ', found, c.type_pattern, array_to_string(c.path, '.'));
    END IF;
  END LOOP;
  SELECT count(*) INTO found
    FROM growth.activity_events e JOIN switch_product_refs p
      ON p.ref = e.subject_id
      OR p.ref = regexp_replace(e.subject_id, '^(public:)?(product|variant):', '')
   WHERE e.subject_type IN ('production_container', 'floor', 'price_floor');
  IF found > 0 THEN
    report := report || format('%s × sujet ; ', found);
  END IF;
  SELECT count(*) INTO found
    FROM growth.activity_events e JOIN switch_product_refs p
      ON e.payload ->> 'subjectLabel' = format('%s (%s)', e.payload ->> 'label', p.ref)
   WHERE e.type LIKE 'production\_batch\_shortcut.%' ESCAPE '\';
  IF found > 0 THEN
    report := report || format('%s × libellé de raccourci ; ', found);
  END IF;
  IF report <> '' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'retour du journal annulé au contrôle de fin, rien n''a été écrit : des '
             || 'références de déclinaison par défaut restent dans le journal — ' || report,
      HINT = 'Rien n''a été écrit. Un chemin du journal que la carte inversée n''atteint pas : '
          || 'relire l''inventaire de la migration 20261030100000 avant de rejouer ce fichier '
          || '(documentation/ops/runbook.md, « Avant de déployer la bascule du défaut »).';
  END IF;
END
$$;

COMMIT;
