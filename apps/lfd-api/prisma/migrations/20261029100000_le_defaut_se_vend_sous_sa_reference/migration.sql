-- LE DÉFAUT SE VEND SOUS SA PROPRE RÉFÉRENCE — la bascule, lot L3 de
-- documentation/catalogue/plan-defaut-sous-sa-reference.md (§ 1 à § 4, § 10).
--
-- Une migration de DONNÉES, partie avec le code où `shopSkuOf(item) = item.sku` :
-- la référence produit (`PAI-001`) cesse d'être une référence de vente, et ne
-- reste qu'une ancienne clé d'entrée, résolue par `sale_sku_alias`.
--
-- 1. LE GARDE-FOU (§ 1, § 2, D-a) compte AVANT toute écriture et lève une
--    exception nommée s'il trouve :
--    - une décision tarifaire posée sur une référence produit (règle,
--      plancher, palier, engagement en portée product/variant ; ligne de
--      mercuriale, de brouillon de mercuriale, de modèle de prix) — archivées
--      comprises : une lecture datée les relit ;
--    - un changement de déclinaison par défaut (G4) déjà joué : la table
--      d'alias, sans dates, suppose que `PAI-001` a toujours désigné le défaut
--      d'aujourd'hui ;
--    - une journée de fournil non close, ou une journée de colisage dont la
--      journée de fournil n'est pas close, qui porte une référence produit
--      (D-a : le fournil et le colisage ne savent pas lire un alias) ;
--    - une fiche à deux déclinaisons par défaut (l'alias serait ambigu).
--    Une « référence produit » est une valeur de `catalog_items.product_sku`
--    absente de `catalog_items.sku`.
--
-- 2. L'ALIAS : pour chaque déclinaison par défaut, `product_sku → sku`
--    (retirées comprises : le passé les porte aussi).
--
-- 3. LES MAGASINS DE CONFIGURATION clés par référence de vente (§ 3, § 10) :
--    contenants et raccourcis du fournil, capacités des bacs, suggestions du
--    staff (articles proposés ET déclencheur sur un article), abonnements et
--    échéances à venir, choix des lots, normes, alertes de stock vivantes,
--    réassorts pas encore remis au fournil, brouillons de réassort ouverts,
--    empreintes des articles du flux vitrine. Chaque réécriture est
--    conditionnée à l'absence de la cible là où une clé l'exige : sans
--    collision, et rejouable.
--    NE SONT PAS RÉÉCRITS (vérifié le 2026-10-29) : `catalog_operation_overrides
--    .hidden_skus` et `catalog_operation_items` (SKU de déclinaison, pas de
--    vente) ; `resupply_receipt_line` (une réception enregistrée est toujours
--    « reçue », donc du passé) ; `production_count` (D-a : aucune journée
--    ouverte ne porte de référence produit) ; lignes de commande, bons,
--    colisages, historique des prix, compteurs `growth`, constats d'alerte —
--    figés, lus par l'alias.
--
-- 🔴 Une transaction EXPLICITE : Prisma Migrate n'en ouvre pas
-- (précédent : 20261024150000_la_reception_suit_la_remise). Un refus du
-- garde-fou n'écrit rien, mais inscrit la migration en échec : tout
-- déploiement suivant s'arrête sur P3009 jusqu'à
-- `prisma migrate resolve --rolled-back 20261029100000_le_defaut_se_vend_sous_sa_reference`
-- (documentation/ops/runbook.md, « Avant de déployer la bascule du défaut »).
--
-- EN DÉVELOPPEMENT : le garde-fou ne compte que hors des bases locales
-- connues (`lfc_b2b_dev`, et `lfc_b2b_test*` — une par ouvrier jest), où des
-- décisions tarifaires de semis et des changements de défaut essayés existent
-- et ne protègent rien. Ailleurs (production, base fantôme de `migrate dev`),
-- il compte. Le
-- réglage de session ou de base `lfd.default_sku_switch_guard` le force
-- (`strict`, ce que fait le test d'intégration) ou l'éteint (`off`, pour une
-- base de dev sous un autre nom). La production n'a ni l'un ni l'autre : le
-- garde-fou y compte.
--
-- Retour arrière : apps/lfd-api/prisma/rollback/20261029100000_le_defaut_se_vend_sous_sa_reference.sql
-- (NON appliqué, Prisma ne lit pas ce dossier), puis redéployer le code d'avant.

BEGIN;

CREATE TEMP TABLE switch_product_refs ON COMMIT DROP AS
  SELECT DISTINCT i.product_sku AS ref
    FROM public.catalog_items i
   WHERE NOT EXISTS (SELECT 1 FROM public.catalog_items s WHERE s.sku = i.product_sku);

CREATE TEMP TABLE switch_findings (label text NOT NULL, total bigint NOT NULL, sample text NOT NULL)
  ON COMMIT DROP;

-- Chaque contrôle : combien, et au plus cinq exemples.
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

-- 1.d Deux défauts pour une même fiche.
INSERT INTO switch_hits
SELECT 'deux déclinaisons par défaut', i.product_sku
  FROM public.catalog_items i
 WHERE i.is_default
 GROUP BY i.product_sku
HAVING count(*) > 1;

-- 1.e D-a : une journée ouverte du fournil qui porte une référence produit.
CREATE TEMP TABLE switch_open_days ON COMMIT DROP AS
  SELECT d.service_day FROM production.production_day d WHERE d.closed_at IS NULL;

INSERT INTO switch_hits
SELECT 'journée de fournil ouverte', format('%s %s', o.service_day, l.sku)
  FROM production.production_order_line l
  JOIN production.production_order o ON o.id = l.production_order_id
  JOIN switch_open_days d ON d.service_day = o.service_day
  JOIN switch_product_refs p ON p.ref = l.sku;
INSERT INTO switch_hits
SELECT 'journée de fournil ouverte', format('%s %s', x.service_day, x.sku)
  FROM (SELECT service_day, sku FROM production.production_count
        UNION SELECT service_day, sku FROM production.production_batch
        UNION SELECT service_day, sku FROM production.production_handoff
        UNION SELECT service_day, sku FROM production.production_return_request
        UNION SELECT service_day, sku FROM production.production_quality_check WHERE sku IS NOT NULL
        UNION SELECT r.service_day, rl.sku
                FROM production.production_resupply_line rl
                JOIN production.production_resupply r ON r.id = rl.production_resupply_id) x
  JOIN switch_open_days d ON d.service_day = x.service_day
  JOIN switch_product_refs p ON p.ref = x.sku;

-- … et le colisage d'une journée dont le fournil n'est pas clos (ou absent).
INSERT INTO switch_hits
SELECT 'journée de colisage ouverte', format('%s %s', x.service_day, x.sku)
  FROM (SELECT service_day, sku FROM packing.packing_line
        UNION SELECT service_day, sku FROM packing.packing_stock
        UNION SELECT service_day, sku FROM packing.packing_receipt
        UNION SELECT service_day, sku FROM packing.packing_return
        UNION SELECT service_day, sku FROM packing.container_line
        UNION SELECT service_day, sku FROM packing.packing_resupply_line
        UNION SELECT service_day, sku FROM packing.packing_stock_reservation) x
  JOIN switch_product_refs p ON p.ref = x.sku
 WHERE NOT EXISTS (SELECT 1 FROM production.production_day d
                    WHERE d.service_day = x.service_day AND d.closed_at IS NOT NULL);

INSERT INTO switch_findings
SELECT h.label, count(*),
       string_agg(h.item, ', ' ORDER BY h.item) FILTER (WHERE h.rank <= 5)
  FROM (SELECT label, item, row_number() OVER (PARTITION BY label ORDER BY item) AS rank
          FROM switch_hits) h
 GROUP BY h.label;

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
  IF NOT counts THEN
    RAISE NOTICE 'bascule-defaut : garde-fou éteint sur la base locale % (réglage « % »).',
      current_database(), setting;
    RETURN;
  END IF;
  SELECT string_agg(format('%s × %s (%s)', f.total, f.label, f.sample), ' ; ' ORDER BY f.label)
    INTO report
    FROM switch_findings f;
  IF report IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'bascule-defaut refusée, rien n''a été écrit : ' || report,
      HINT = 'Décision tarifaire : l''archiver maintenant, la reposer sur la référence de la '
          || 'déclinaison (PAI-001-1) après la bascule. Changement de défaut déjà joué : ne pas '
          || 'déployer, la question Q2 du plan est à trancher par Hugo. Journée ouverte : la '
          || 'clore, ou déployer un jour sans service ouvert (D-a). Puis, sur la production : '
          || 'prisma migrate resolve --rolled-back 20261029100000_le_defaut_se_vend_sous_sa_reference, '
          || 'et redéployer (documentation/ops/runbook.md, « Avant de déployer la bascule du défaut »).';
  END IF;
END
$$;

-- 2. L'alias : l'ancienne référence désigne la déclinaison par défaut d'aujourd'hui.
INSERT INTO public.sale_sku_alias (alias_sku, target_sku, written_at)
SELECT i.product_sku, i.sku, now()
  FROM public.catalog_items i
  JOIN switch_product_refs p ON p.ref = i.product_sku
 WHERE i.is_default
ON CONFLICT (alias_sku) DO NOTHING;

-- 3. Les magasins de configuration.
UPDATE production.production_container c
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE c.sku = a.alias_sku
   AND NOT EXISTS (SELECT 1 FROM production.production_container t WHERE t.sku = a.target_sku);

UPDATE production.production_batch_shortcut s
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE s.sku = a.alias_sku AND s.removed_at IS NULL;

UPDATE delivery.delivery_bin_capacity c
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE c.sku = a.alias_sku
   AND NOT EXISTS (SELECT 1 FROM delivery.delivery_bin_capacity t
                    WHERE t.bin_type_id = c.bin_type_id AND t.sku = a.target_sku);

UPDATE public.staff_suggestion_rules r
   SET suggested_skus = ARRAY(
         SELECT q.sku FROM (
           SELECT COALESCE(a.target_sku, u.sku) AS sku, min(u.rank) AS rank
             FROM unnest(r.suggested_skus) WITH ORDINALITY AS u(sku, rank)
             LEFT JOIN public.sale_sku_alias a ON a.alias_sku = u.sku
            GROUP BY 1) q
          ORDER BY q.rank)
 WHERE r.archived_at IS NULL
   AND r.suggested_skus && ARRAY(SELECT alias_sku FROM public.sale_sku_alias);

UPDATE public.staff_suggestion_rules r
   SET trigger_ref = a.target_sku
  FROM public.sale_sku_alias a
 WHERE r.trigger_ref = a.alias_sku
   AND r.trigger_kind IN ('product_in_cart', 'product_viewed')
   AND r.archived_at IS NULL;

UPDATE public.subscription_lines l
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE l.sku = a.alias_sku;

UPDATE public.subscription_occurrences o
   SET lines = (
         SELECT jsonb_agg(CASE WHEN a.target_sku IS NULL THEN e.line
                               ELSE jsonb_set(e.line, '{sku}', to_jsonb(a.target_sku)) END
                          ORDER BY e.rank)
           FROM jsonb_array_elements(o.lines) WITH ORDINALITY AS e(line, rank)
           LEFT JOIN public.sale_sku_alias a ON a.alias_sku = e.line ->> 'sku')
 WHERE jsonb_typeof(o.lines) = 'array'
   AND o.occurrence_date >= (now() AT TIME ZONE 'Europe/Paris')::date
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.lines) e
                 JOIN public.sale_sku_alias a ON a.alias_sku = e ->> 'sku');

UPDATE public.bundle_choices c
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE c.sku = a.alias_sku
   AND NOT EXISTS (SELECT 1 FROM public.bundle_choices t
                    WHERE t.bundle_id = c.bundle_id AND t.sku = a.target_sku);

UPDATE public.product_norms n
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE n.sku = a.alias_sku
   AND NOT EXISTS (SELECT 1 FROM public.product_norms t WHERE t.sku = a.target_sku);

UPDATE public.site_stock_alert s
   SET sku = a.target_sku
  FROM public.sale_sku_alias a
 WHERE s.sku = a.alias_sku AND s.lifted_at IS NULL;

-- Un réassort déjà remis au fournil garde sa référence : le fournil et le
-- colisage l'ont copiée, et la réception se pré-remplit de ce qui a été emballé.
UPDATE public.site_resupply_line l
   SET sku = a.target_sku
  FROM public.sale_sku_alias a, public.site_resupply r
 WHERE l.sku = a.alias_sku
   AND r.id = l.resupply_id
   AND r.cancelled_at IS NULL
   AND r.arrived_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM production.production_resupply p WHERE p.resupply_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM public.site_resupply_line t
                    WHERE t.resupply_id = l.resupply_id AND t.sku = a.target_sku);

UPDATE public.bakehouse_resupply_drafts d
   SET lines = (
         SELECT jsonb_agg(CASE WHEN a.target_sku IS NULL THEN e.line
                               ELSE jsonb_set(e.line, '{sku}', to_jsonb(a.target_sku)) END
                          ORDER BY e.rank)
           FROM jsonb_array_elements(d.lines) WITH ORDINALITY AS e(line, rank)
           LEFT JOIN public.sale_sku_alias a ON a.alias_sku = e.line ->> 'sku')
 WHERE d.status = 'open'
   AND jsonb_typeof(d.lines) = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.lines) e
                 JOIN public.sale_sku_alias a ON a.alias_sku = e ->> 'sku');

UPDATE public.vitrine_fingerprints f
   SET element_key = a.target_sku
  FROM public.sale_sku_alias a
 WHERE f.kind = 'item'
   AND f.element_key = a.alias_sku
   AND NOT EXISTS (SELECT 1 FROM public.vitrine_fingerprints t
                    WHERE t.subscriber_id = f.subscriber_id AND t.kind = 'item'
                      AND t.element_key = a.target_sku);

COMMIT;
