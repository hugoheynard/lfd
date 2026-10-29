-- LE DÉFAUT SE VEND SOUS SA PROPRE RÉFÉRENCE — la bascule, SANS ALIAS
-- (documentation/catalogue/plan-defaut-sous-sa-reference.md, révision 3 :
-- décision de Hugo du 2026-10-29).
--
-- Une migration de DONNÉES, partie avec le code où `shopSkuOf(item) = item.sku`.
-- La référence produit d'une fiche (`PAI-001`) cesse d'être une référence de
-- vente, et elle est RÉÉCRITE PARTOUT où elle était stockée vers la référence
-- de la déclinaison par défaut de sa fiche (`PAI-001-1`). Aucune table de
-- traduction n'est écrite (`sale_sku_alias` reste vide) : en pré-release,
-- toutes les commandes existantes sont des essais de Hugo, qui accepte
-- qu'elles soient réécrites (commandes, bons, instantanés figés compris). Les
-- documents ÉMIS — factures, arrêtés — ne le sont pas : ils sont figés.
--
-- 1. LE GARDE-FOU compte AVANT toute écriture et refuse, sans rien écrire :
--    - une décision tarifaire posée sur une référence produit (règle,
--      plancher, palier, engagement en portée product/variant ; ligne de
--      mercuriale, de brouillon de mercuriale, de modèle de prix) — archivées
--      comprises : une lecture datée les relit ;
--    - un changement de déclinaison par défaut (G4) déjà joué : réécrire vers
--      le défaut d'AUJOURD'HUI ferait mentir le passé d'avant ce changement ;
--    - une fiche à deux déclinaisons par défaut (la cible serait ambiguë) ;
--    - une FACTURE ou un ARRÊTÉ émis qui porte une référence produit : un
--      document émis est figé (déclencheurs `invoice_immutable`,
--      `billing_statement_immutable`), il ne se réécrit pas — en production il
--      ne doit pas y en avoir ; sur une base locale, ils gardent `PAI-001` ;
--    - une COLLISION : une ligne sous `PAI-001` et une sous `PAI-001-1` dans
--      une table où la référence fait partie d'une clé (une commande qui porte
--      les deux, une journée de colisage qui stocke les deux…). Fusionner deux
--      lignes de commande ou deux stocks n'est pas une réécriture : c'est une
--      décision, et elle se prend à la main.
--    Le garde-fou ne s'éteint que sur les bases locales connues (`lfc_b2b_dev`,
--    `lfc_b2b_test*`) ou par le réglage `lfd.default_sku_switch_guard = 'off'` ;
--    `'strict'` le force. La production n'a ni l'un ni l'autre.
--    Les refus « journée ouverte » et « commande à venir » de la révision 2
--    sont RETIRÉS : ils protégeaient la lecture par alias ; tout étant
--    réécrit dans la même transaction, fournil, colisage et commerce lisent
--    la même référence.
--
-- 2. LA RÉÉCRITURE, pour chaque défaut `product_sku → sku` (retirés compris) :
--    colonnes `sku` du commerce, du fournil, du colisage, de la livraison, de
--    `growth` (compteurs) ; listes de SKU (`suggested_skus`, `hidden_skus`) ;
--    déclencheurs de suggestion ; empreintes de la vitrine ; et toute valeur
--    sous une clé `sku` (ou dans une liste `*skus` / `items`) des jsonb
--    inventoriés au plan (§ 16). Là où une clé ne tolère pas deux lignes :
--    COLLISION refusée plus haut, sauf pour des réglages et des comptes où
--    la règle est écrite ici — la ligne de la cible l'emporte (contenants,
--    contenances, choix de lot, normes, empreintes), ou les comptes
--    s'additionnent (compteurs d'audience).
--    Les décisions tarifaires sont réécrites aussi, sans collision : en
--    production le garde-fou a établi qu'il n'y en a aucune ; sur une base de
--    développement, une décision qui heurterait celle de la cible reste où
--    elle est.
--    NON RÉÉCRITS : le journal `growth.activity_events` (des faits datés, lus
--    tels qu'écrits) ; les documents émis, `invoice.lines` et
--    `billing_statement.body` (figés, comme le journal) ; les tables du
--    référentiel (`pim.*`) — `pim.operation_items` ne porte que des SKU de
--    déclinaison, validés contre `catalog_items.sku` à l'écriture
--    (`PrismaOperationSkuCatalogue`, vérifié le 2026-10-29) : une republication
--    ne réinjecte pas de référence produit.
--    🔴 IRRÉVERSIBLE : la suppression des réglages où la cible l'emporte (2.c)
--    et l'addition des compteurs d'audience (2.d) ne se défont pas — le retour
--    arrière ne retrouve ni la ligne supprimée ni le partage des comptes.
--    `public.day_change` et `production.day_change` reçoivent une version de
--    plus pour chaque journée touchée, passées comprises (déclencheurs par
--    instruction) : un écran ouvert sur ces journées relit une fois.
--
-- 3. LE CONTRÔLE DE FIN, dans la même transaction : plus AUCUNE référence
--    produit dans aucune colonne réécrite ; sinon tout est annulé.
--
-- 🔴 Une transaction EXPLICITE : Prisma Migrate n'en ouvre pas. Un refus
-- n'écrit rien, mais inscrit la migration en échec : tout déploiement suivant
-- s'arrête sur P3009 jusqu'à
-- `prisma migrate resolve --rolled-back 20261029180000_le_defaut_se_vend_sous_sa_reference`
-- (documentation/ops/runbook.md, « Avant de déployer la bascule du défaut »).
--
-- Retour arrière : apps/lfd-api/prisma/rollback/20261029180000_le_defaut_se_vend_sous_sa_reference.sql
-- (NON appliqué ; possible seulement tant qu'aucune commande n'a été passée
-- sous `-1` après la bascule).

-- Les tables réécrites sont écrites par les passations : mieux vaut un
-- déploiement qui échoue proprement en 5 s qu'une file de commandes bloquées.
SET lock_timeout = '5s';

BEGIN;

CREATE TEMP TABLE switch_map ON COMMIT DROP AS
  SELECT i.product_sku AS ref, i.sku AS target
    FROM public.catalog_items i
   WHERE i.is_default
     AND i.product_sku <> i.sku
     AND NOT EXISTS (SELECT 1 FROM public.catalog_items s WHERE s.sku = i.product_sku);

-- Une référence produit sans défaut se compte aussi au contrôle de fin.
CREATE TEMP TABLE switch_product_refs ON COMMIT DROP AS
  SELECT DISTINCT i.product_sku AS ref
    FROM public.catalog_items i
   WHERE NOT EXISTS (SELECT 1 FROM public.catalog_items s WHERE s.sku = i.product_sku);

CREATE TEMP TABLE switch_hits (label text NOT NULL, item text NOT NULL) ON COMMIT DROP;

-- 1.a Décisions à portée (règles, planchers, paliers, engagements).
INSERT INTO switch_hits
SELECT 'PriceRule', format('%s:%s (%s)', r.scope_type, r.scope_id, r.id)
  FROM public.price_rules r JOIN switch_product_refs p ON p.ref = r.scope_id
 WHERE r.scope_type IN ('product', 'variant');
INSERT INTO switch_hits
SELECT 'PriceFloor', format('%s:%s (%s)', f.scope_type, f.scope_id, f.id)
  FROM public.price_floors f JOIN switch_product_refs p ON p.ref = f.scope_id
 WHERE f.scope_type IN ('product', 'variant');
INSERT INTO switch_hits
SELECT 'VolumeLadder', format('%s:%s (%s)', l.scope_type, l.scope_id, l.id)
  FROM public.volume_ladders l JOIN switch_product_refs p ON p.ref = l.scope_id
 WHERE l.scope_type IN ('product', 'variant');
INSERT INTO switch_hits
SELECT 'VolumeCommitment', format('%s:%s (%s)', c.scope_type, c.scope_id, c.id)
  FROM public.volume_commitments c JOIN switch_product_refs p ON p.ref = c.scope_id
 WHERE c.scope_type IN ('product', 'variant');

-- 1.b Grilles en jsonb : `lines[].sku`.
INSERT INTO switch_hits
SELECT 'CompanyMercuriale', format('%s ligne %s', m.id, l ->> 'sku')
  FROM public.company_mercuriales m
 CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(m.lines) = 'array' THEN m.lines ELSE '[]'::jsonb END) l
  JOIN switch_product_refs p ON p.ref = l ->> 'sku';
INSERT INTO switch_hits
SELECT 'MercurialeDraft', format('société %s ligne %s', d.company_id, l ->> 'sku')
  FROM public.mercuriale_drafts d
 CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(d.lines) = 'array' THEN d.lines ELSE '[]'::jsonb END) l
  JOIN switch_product_refs p ON p.ref = l ->> 'sku';
INSERT INTO switch_hits
SELECT 'PriceTemplate', format('%s ligne %s', t.id, l ->> 'sku')
  FROM public.price_templates t
 CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(t.lines) = 'array' THEN t.lines ELSE '[]'::jsonb END) l
  JOIN switch_product_refs p ON p.ref = l ->> 'sku';

-- 1.c Le changement de défaut déjà joué (G4).
INSERT INTO switch_hits
SELECT 'product.default_variant_changed',
       format('%s → %s le %s', e.payload ->> 'previousSku', e.payload ->> 'sku',
              to_char(e.occurred_at, 'YYYY-MM-DD'))
  FROM growth.activity_events e
 WHERE e.type = 'product.default_variant_changed';

-- 1.c bis Les documents émis, figés : une facture ou un arrêté qui porte une
-- référence produit sous une clé `sku`.
INSERT INTO switch_hits
SELECT DISTINCT 'facture émise', i.number
  FROM public.invoice i
 CROSS JOIN LATERAL jsonb_path_query(i.lines, 'lax $.**.sku') v
  JOIN switch_product_refs p ON jsonb_typeof(v) = 'string' AND p.ref = v #>> '{}';
INSERT INTO switch_hits
SELECT DISTINCT 'arrêté émis', b.id
  FROM public.billing_statement b
 CROSS JOIN LATERAL jsonb_path_query(b.body, 'lax $.**.sku') v
  JOIN switch_product_refs p ON jsonb_typeof(v) = 'string' AND p.ref = v #>> '{}';

-- 1.d Deux défauts pour une même fiche.
INSERT INTO switch_hits
SELECT 'deux déclinaisons par défaut', i.product_sku
  FROM public.catalog_items i
 WHERE i.is_default
 GROUP BY i.product_sku
HAVING count(*) > 1;

-- 1.e Les collisions : `ref` et `target` sous la même clé. Toujours comptées,
-- base locale comprise : la réécriture lèverait sinon une violation de clé
-- sans nom.
CREATE FUNCTION pg_temp.switch_collisions(tbl text, keys text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO switch_hits
     SELECT %L, concat_ws('' '', %s, m.ref)
       FROM %s a JOIN switch_map m ON a.sku = m.ref
      WHERE EXISTS (SELECT 1 FROM %s b WHERE b.sku = m.target AND %s)',
    label,
    (SELECT string_agg(format('a.%I', k), ', ') FROM unnest(string_to_array(keys, ',')) k),
    tbl, tbl,
    (SELECT string_agg(format('b.%I = a.%I', k, k), ' AND ') FROM unnest(string_to_array(keys, ',')) k));
END
$$;

SELECT pg_temp.switch_collisions('public.order_lines', 'order_id', 'collision : commande');
SELECT pg_temp.switch_collisions('public.site_resupply_line', 'resupply_id', 'collision : réassort');
SELECT pg_temp.switch_collisions('public.resupply_receipt_line', 'receipt_id', 'collision : réception');
SELECT pg_temp.switch_collisions('public.catalog_operation_items', 'operation_key', 'collision : opération');
SELECT pg_temp.switch_collisions('production.production_count', 'service_day', 'collision : compte du fournil');
SELECT pg_temp.switch_collisions('packing.packing_line', 'service_day,order_id,rank', 'collision : ligne de colisage');
SELECT pg_temp.switch_collisions('packing.packing_stock', 'service_day', 'collision : stock du colisage');
SELECT pg_temp.switch_collisions('packing.container_line', 'container_id', 'collision : contenant');
SELECT pg_temp.switch_collisions('packing.packing_resupply_line', 'service_day,resupply_id', 'collision : réassort au colisage');
SELECT pg_temp.switch_collisions('packing.packing_stock_reservation', 'service_day,resupply_id', 'collision : réservation de stock');
SELECT pg_temp.switch_collisions('delivery.delivery_internal_transfer_manifest_line', 'transfer_id,item_id', 'collision : transfert');
-- L'index unique des alertes est PARTIEL : seules les alertes vivantes se heurtent.
INSERT INTO switch_hits
SELECT 'collision : alerte de stock', concat_ws(' ', a.site_id, m.ref)
  FROM public.site_stock_alert a JOIN switch_map m ON a.sku = m.ref
 WHERE a.lifted_at IS NULL
   AND EXISTS (SELECT 1 FROM public.site_stock_alert b
                WHERE b.sku = m.target AND b.site_id = a.site_id AND b.lifted_at IS NULL);

DO $$
DECLARE
  setting text := COALESCE(current_setting('lfd.default_sku_switch_guard', true), '');
  counts boolean;
  report text;
BEGIN
  counts := CASE setting
              WHEN 'strict' THEN true
              WHEN 'off' THEN false
              ELSE NOT (current_database() = 'lfc_b2b_dev'
                        OR current_database() LIKE 'lfc\_b2b\_test%')
            END;
  SELECT string_agg(format('%s × %s (%s)', f.total, f.label, f.sample), ' ; ' ORDER BY f.label)
    INTO report
    FROM (SELECT h.label, count(*) AS total,
                 string_agg(h.item, ', ' ORDER BY h.item) FILTER (WHERE h.rank <= 5) AS sample
            FROM (SELECT label, item, row_number() OVER (PARTITION BY label ORDER BY item) AS rank
                    FROM switch_hits) h
           WHERE counts OR h.label LIKE 'collision : %'
           GROUP BY h.label) f;
  IF report IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'bascule-defaut refusée, rien n''a été écrit : ' || report,
      HINT = 'Décision tarifaire : l''archiver maintenant, la reposer sur la référence de la '
          || 'déclinaison (PAI-001-1) après la bascule. Facture ou arrêté émis : un document émis '
          || 'ne se réécrit pas, la question est à trancher par Hugo. Changement de défaut déjà joué : ne pas '
          || 'déployer, la question Q2 du plan est à trancher par Hugo. Collision : corriger la '
          || 'commande, le réassort ou la journée nommés pour qu''ils ne portent plus qu''une des '
          || 'deux références. Puis, sur la production : prisma migrate resolve --rolled-back '
          || '20261029180000_le_defaut_se_vend_sous_sa_reference, et redéployer '
          || '(documentation/ops/runbook.md, « Avant de déployer la bascule du défaut »).';
  END IF;
  IF NOT counts THEN
    RAISE NOTICE 'bascule-defaut : garde-fou des décisions éteint sur la base locale % (réglage « % »).',
      current_database(), setting;
  END IF;
END
$$;

-- 2. LA RÉÉCRITURE.

-- 2.a jsonb : toute valeur sous une clé `sku`, et toute chaîne d'une liste
-- sous une clé `…skus` ou `items`.
CREATE FUNCTION pg_temp.switch_json(j jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  k text;
  v jsonb;
  out jsonb;
BEGIN
  IF j IS NULL THEN
    RETURN NULL;
  ELSIF jsonb_typeof(j) = 'object' THEN
    out := '{}'::jsonb;
    FOR k, v IN SELECT * FROM jsonb_each(j) LOOP
      IF lower(k) = 'sku' AND jsonb_typeof(v) = 'string' THEN
        v := COALESCE((SELECT to_jsonb(m.target) FROM switch_map m WHERE m.ref = v #>> '{}'), v);
      ELSIF (lower(k) LIKE '%skus' OR k = 'items') AND jsonb_typeof(v) = 'array' THEN
        v := (SELECT COALESCE(jsonb_agg(
                 CASE WHEN jsonb_typeof(e) = 'string'
                      THEN COALESCE((SELECT to_jsonb(m.target) FROM switch_map m WHERE m.ref = e #>> '{}'), e)
                      ELSE pg_temp.switch_json(e) END ORDER BY n), '[]'::jsonb)
                FROM jsonb_array_elements(v) WITH ORDINALITY AS t(e, n));
      ELSE
        v := pg_temp.switch_json(v);
      END IF;
      out := out || jsonb_build_object(k, v);
    END LOOP;
    RETURN out;
  ELSIF jsonb_typeof(j) = 'array' THEN
    RETURN (SELECT COALESCE(jsonb_agg(pg_temp.switch_json(e) ORDER BY n), '[]'::jsonb)
              FROM jsonb_array_elements(j) WITH ORDINALITY AS t(e, n));
  END IF;
  RETURN j;
END
$$;

-- Le jumeau qui COMPTE, aux mêmes positions, les références produit qui
-- restent (contrôle de fin) : une valeur égale à une référence produit sous
-- une autre clé (`productSku`, un nom) n'est pas une référence de vente.
CREATE FUNCTION pg_temp.switch_json_refs(j jsonb) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE
  k text;
  v jsonb;
  total bigint := 0;
BEGIN
  IF j IS NULL THEN
    RETURN 0;
  ELSIF jsonb_typeof(j) = 'object' THEN
    FOR k, v IN SELECT * FROM jsonb_each(j) LOOP
      IF lower(k) = 'sku' AND jsonb_typeof(v) = 'string' THEN
        total := total + (SELECT count(*) FROM switch_product_refs p WHERE p.ref = v #>> '{}');
      ELSIF (lower(k) LIKE '%skus' OR k = 'items') AND jsonb_typeof(v) = 'array' THEN
        total := total + (SELECT COALESCE(sum(
                   CASE WHEN jsonb_typeof(e) = 'string'
                        THEN (SELECT count(*) FROM switch_product_refs p WHERE p.ref = e #>> '{}')
                        ELSE pg_temp.switch_json_refs(e) END), 0)
                   FROM jsonb_array_elements(v) AS t(e));
      ELSE
        total := total + pg_temp.switch_json_refs(v);
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(j) = 'array' THEN
    total := (SELECT COALESCE(sum(pg_temp.switch_json_refs(e)), 0) FROM jsonb_array_elements(j) AS t(e));
  END IF;
  RETURN total;
END
$$;

-- Les colonnes jsonb inventoriées (plan, § 16). Une colonne qui EST une liste
-- de SKU (`excluded_skus`) se lit comme la valeur d'une clé `skus`. Une ligne n'est écrite que si
-- la réécriture la change.
CREATE TEMP TABLE switch_json_columns (tbl text NOT NULL, col text NOT NULL, expr text) ON COMMIT DROP;
INSERT INTO switch_json_columns (tbl, col) VALUES
  ('public.orders', 'shortfall_lines'),
  ('public.orders', 'recurring_deltas'),
  ('public.order_shortfall', 'lines'),
  ('public.order_shortfall_decision', 'departing'),
  ('public.order_revision', 'composition'),
  ('public.order_drafts', 'payload'),
  ('public.shop_carts', 'payload'),
  ('public.subscription_occurrences', 'lines'),
  ('public.bakehouse_resupply_drafts', 'lines'),
  ('public.account_alerts', 'findings'),
  ('public.customer_request', 'change_content'),
  ('public.catalog_versions', 'items'),
  ('public.catalog_versions', 'excluded_skus'),
  ('public.vitrine_deliveries', 'changes'),
  ('delivery.delivery_purchase_scenario', 'content'),
  ('delivery.delivery_simulation_scenario', 'scenario');
UPDATE switch_json_columns
   SET expr = format('jsonb_build_object(''skus'', %I)', col)
 WHERE col = 'excluded_skus';
UPDATE switch_json_columns SET expr = format('%I', col) WHERE expr IS NULL;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT * FROM switch_json_columns LOOP
    EXECUTE format(
      'UPDATE %s SET %I = %s
        WHERE %I IS NOT NULL AND pg_temp.switch_json_refs(%s) > 0',
      c.tbl, c.col,
      CASE WHEN c.col = 'excluded_skus'
           THEN format('pg_temp.switch_json(%s) -> ''skus''', c.expr)
           ELSE format('pg_temp.switch_json(%s)', c.expr) END,
      c.col, c.expr);
  END LOOP;
END
$$;

-- 2.b Colonnes `sku` sans clé qui les contienne, et clés sans collision
-- (refusées plus haut). Les FK `ON UPDATE CASCADE` du colisage suivent.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.order_lines', 'public.delivery_note_line', 'public.subscription_lines',
    'public.site_resupply_line', 'public.resupply_receipt_line', 'public.site_stock_alert',
    'public.catalog_operation_items',
    'production.production_order_line', 'production.production_count',
    'production.production_batch', 'production.production_handoff',
    'production.production_return_request', 'production.production_quality_check',
    'production.production_resupply_line', 'production.production_batch_shortcut',
    'packing.packing_line', 'packing.packing_stock', 'packing.packing_receipt',
    'packing.packing_return', 'packing.container_line', 'packing.packing_resupply_line',
    'packing.packing_stock_reservation',
    'delivery.delivery_internal_transfer_manifest_line'
  ] LOOP
    EXECUTE format('UPDATE %s a SET sku = m.target FROM switch_map m WHERE a.sku = m.ref', t);
  END LOOP;
END
$$;

-- 2.c Réglages où la ligne de la cible l'emporte.
DELETE FROM production.production_container c USING switch_map m
 WHERE c.sku = m.ref AND EXISTS (SELECT 1 FROM production.production_container t WHERE t.sku = m.target);
UPDATE production.production_container c SET sku = m.target FROM switch_map m WHERE c.sku = m.ref;

DELETE FROM delivery.delivery_bin_capacity c USING switch_map m
 WHERE c.sku = m.ref AND EXISTS (SELECT 1 FROM delivery.delivery_bin_capacity t
                                  WHERE t.bin_type_id = c.bin_type_id AND t.sku = m.target);
UPDATE delivery.delivery_bin_capacity c SET sku = m.target FROM switch_map m WHERE c.sku = m.ref;

DELETE FROM public.bundle_choices c USING switch_map m
 WHERE c.sku = m.ref AND EXISTS (SELECT 1 FROM public.bundle_choices t
                                  WHERE t.bundle_id = c.bundle_id AND t.sku = m.target);
UPDATE public.bundle_choices c SET sku = m.target FROM switch_map m WHERE c.sku = m.ref;

DELETE FROM public.product_norms n USING switch_map m
 WHERE n.sku = m.ref AND EXISTS (SELECT 1 FROM public.product_norms t WHERE t.sku = m.target);
UPDATE public.product_norms n SET sku = m.target FROM switch_map m WHERE n.sku = m.ref;

DELETE FROM public.vitrine_fingerprints f USING switch_map m
 WHERE f.kind = 'item' AND f.element_key = m.ref
   AND EXISTS (SELECT 1 FROM public.vitrine_fingerprints t
                WHERE t.subscriber_id = f.subscriber_id AND t.kind = 'item'
                  AND t.element_key = m.target);
UPDATE public.vitrine_fingerprints f SET element_key = m.target FROM switch_map m
 WHERE f.kind = 'item' AND f.element_key = m.ref;

-- 2.d Les compteurs d'audience s'additionnent.
INSERT INTO growth.product_audience_counters (day, sku, event, placement, source, count)
SELECT c.day, m.target, c.event, c.placement, c.source, c.count
  FROM growth.product_audience_counters c JOIN switch_map m ON m.ref = c.sku
ON CONFLICT (day, sku, event, placement, source)
DO UPDATE SET count = growth.product_audience_counters.count + EXCLUDED.count;
DELETE FROM growth.product_audience_counters c USING switch_map m WHERE c.sku = m.ref;

-- 2.e Listes et déclencheurs.
UPDATE public.staff_suggestion_rules r
   SET suggested_skus = ARRAY(
         SELECT q.sku FROM (
           SELECT COALESCE(m.target, u.sku) AS sku, min(u.rank) AS rank
             FROM unnest(r.suggested_skus) WITH ORDINALITY AS u(sku, rank)
             LEFT JOIN switch_map m ON m.ref = u.sku
            GROUP BY 1) q
          ORDER BY q.rank)
 WHERE r.suggested_skus && ARRAY(SELECT ref FROM switch_map);
UPDATE public.staff_suggestion_rules r
   SET trigger_ref = m.target
  FROM switch_map m
 WHERE r.trigger_ref = m.ref AND r.trigger_kind IN ('product_in_cart', 'product_viewed');
UPDATE public.catalog_operation_overrides o
   SET hidden_skus = ARRAY(SELECT DISTINCT COALESCE(m.target, u) FROM unnest(o.hidden_skus) u
                             LEFT JOIN switch_map m ON m.ref = u)
 WHERE o.hidden_skus && ARRAY(SELECT ref FROM switch_map);

-- 2.f Les décisions tarifaires (aucune en production, garde-fou ci-dessus).
UPDATE public.price_rules x SET scope_id = m.target FROM switch_map m
 WHERE x.scope_type IN ('product', 'variant') AND x.scope_id = m.ref
   AND NOT EXISTS (SELECT 1 FROM public.price_rules y WHERE y.scope_id = m.target
                    AND y.scope_type = x.scope_type);
UPDATE public.price_floors x SET scope_id = m.target FROM switch_map m
 WHERE x.scope_type IN ('product', 'variant') AND x.scope_id = m.ref
   AND NOT EXISTS (SELECT 1 FROM public.price_floors y WHERE y.scope_id = m.target
                    AND y.scope_type = x.scope_type);
UPDATE public.volume_ladders x SET scope_id = m.target FROM switch_map m
 WHERE x.scope_type IN ('product', 'variant') AND x.scope_id = m.ref
   AND NOT EXISTS (SELECT 1 FROM public.volume_ladders y WHERE y.scope_id = m.target
                    AND y.scope_type = x.scope_type);
UPDATE public.volume_commitments x SET scope_id = m.target FROM switch_map m
 WHERE x.scope_type IN ('product', 'variant') AND x.scope_id = m.ref
   AND NOT EXISTS (SELECT 1 FROM public.volume_commitments y WHERE y.scope_id = m.target
                    AND y.scope_type = x.scope_type);
UPDATE public.company_mercuriales SET lines = pg_temp.switch_json(lines)
 WHERE pg_temp.switch_json_refs(lines) > 0;
UPDATE public.mercuriale_drafts SET lines = pg_temp.switch_json(lines)
 WHERE pg_temp.switch_json_refs(lines) > 0;
UPDATE public.price_templates SET lines = pg_temp.switch_json(lines)
 WHERE pg_temp.switch_json_refs(lines) > 0;

-- 3. LE CONTRÔLE DE FIN : aucune référence produit ne reste.
DO $$
DECLARE
  t text;
  c record;
  found bigint;
  report text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.order_lines', 'public.delivery_note_line', 'public.subscription_lines',
    'public.site_resupply_line', 'public.resupply_receipt_line', 'public.site_stock_alert',
    'public.catalog_operation_items', 'public.bundle_choices', 'public.product_norms',
    'production.production_order_line', 'production.production_count',
    'production.production_batch', 'production.production_handoff',
    'production.production_return_request', 'production.production_quality_check',
    'production.production_resupply_line', 'production.production_batch_shortcut',
    'production.production_container',
    'packing.packing_line', 'packing.packing_stock', 'packing.packing_receipt',
    'packing.packing_return', 'packing.container_line', 'packing.packing_resupply_line',
    'packing.packing_stock_reservation',
    'delivery.delivery_internal_transfer_manifest_line', 'delivery.delivery_bin_capacity',
    'growth.product_audience_counters'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM %s a JOIN switch_product_refs p ON p.ref = a.sku', t)
      INTO found;
    IF found > 0 THEN
      report := report || format('%s × %s ; ', found, t);
    END IF;
  END LOOP;
  FOR c IN SELECT * FROM switch_json_columns LOOP
    EXECUTE format('SELECT COALESCE(sum(pg_temp.switch_json_refs(%s)), 0) FROM %s', c.expr, c.tbl)
      INTO found;
    IF found > 0 THEN
      report := report || format('%s × %s.%s ; ', found, c.tbl, c.col);
    END IF;
  END LOOP;
  SELECT count(*) INTO found
    FROM public.vitrine_fingerprints f JOIN switch_product_refs p ON p.ref = f.element_key
   WHERE f.kind = 'item';
  IF found > 0 THEN
    report := report || format('%s × public.vitrine_fingerprints ; ', found);
  END IF;
  SELECT count(*) INTO found
    FROM public.staff_suggestion_rules r
   WHERE r.suggested_skus && ARRAY(SELECT ref FROM switch_product_refs)
      OR (r.trigger_kind IN ('product_in_cart', 'product_viewed')
          AND r.trigger_ref IN (SELECT ref FROM switch_product_refs));
  IF found > 0 THEN
    report := report || format('%s × public.staff_suggestion_rules ; ', found);
  END IF;
  IF report <> '' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'bascule-defaut annulée au contrôle de fin, rien n''a été écrit : des références '
             || 'produit restent après la réécriture — ' || report,
      HINT = 'Une fiche sans déclinaison par défaut, ou une colonne absente de l''inventaire du '
          || 'plan (§ 16) : la compléter, puis prisma migrate resolve --rolled-back '
          || '20261029180000_le_defaut_se_vend_sous_sa_reference.';
  END IF;
END
$$;

COMMIT;
