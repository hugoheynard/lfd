-- RETOUR ARRIÈRE de 20261029100000_le_defaut_se_vend_sous_sa_reference
-- (documentation/catalogue/plan-defaut-sous-sa-reference.md, L3).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas : `migrate deploy` ne regarde que
-- `prisma/migrations/*/migration.sql`. Il se joue À LA MAIN, une fois, par
-- l'URL DIRECTE de la base (celle de `DATABASE_LFD_PROD_DIRECT_URL`), et
-- seulement avec le code d'AVANT la bascule redéployé juste après — le code de
-- la bascule, lui, lit `PAI-001-1` et non `PAI-001`. Le geste entier :
-- documentation/ops/runbook.md, « Avant de déployer la bascule du défaut ».
--
-- Il défait ce que la migration a écrit : les magasins de configuration
-- reprennent la référence produit, puis la table d'alias est vidée (elle était
-- vide avant la bascule, et seule la bascule l'écrit — vérifié le 2026-10-29).
-- La migration reste inscrite « appliquée » dans `_prisma_migrations` : on ne
-- la résout pas. Rebasculer plus tard demandera une NOUVELLE migration.
--
-- Il refuse, sans rien écrire, si le monde a bougé depuis la bascule d'une
-- façon qu'il ne sait pas défaire :
--   - un changement de défaut (G4) joué APRÈS la bascule : `PAI-001-1` ne
--     serait plus le défaut, et le rendre à `PAI-001` ferait glisser ce qui
--     est posé dessus ;
--   - une décision tarifaire posée sur la référence d'une déclinaison par
--     défaut : l'ancien code vend le défaut sous `PAI-001`, la décision ne
--     jouerait plus, sans que personne le voie.

BEGIN;

DO $$
DECLARE
  switched_at timestamp;
  report text;
BEGIN
  SELECT min(written_at) INTO switched_at FROM public.sale_sku_alias;
  IF switched_at IS NULL THEN
    RAISE EXCEPTION 'retour-arriere-defaut : la table sale_sku_alias est vide, il n''y a rien à défaire.';
  END IF;
  SELECT string_agg(x.item, ', ' ORDER BY x.item) INTO report FROM (
    SELECT format('changement de défaut %s → %s le %s', e.payload ->> 'previousSku',
                  e.payload ->> 'sku', to_char(e.occurred_at, 'YYYY-MM-DD')) AS item
      FROM growth.activity_events e
     WHERE e.type = 'product.default_variant_changed' AND e.occurred_at > switched_at
    UNION ALL
    SELECT format('PriceRule %s:%s', r.scope_type, r.scope_id)
      FROM public.price_rules r JOIN public.sale_sku_alias a ON a.target_sku = r.scope_id
     WHERE r.scope_type IN ('product', 'variant') AND r.archived_at IS NULL
    UNION ALL
    SELECT format('PriceFloor %s:%s', f.scope_type, f.scope_id)
      FROM public.price_floors f JOIN public.sale_sku_alias a ON a.target_sku = f.scope_id
     WHERE f.scope_type IN ('product', 'variant') AND f.archived_at IS NULL
    UNION ALL
    SELECT format('VolumeLadder %s:%s', l.scope_type, l.scope_id)
      FROM public.volume_ladders l JOIN public.sale_sku_alias a ON a.target_sku = l.scope_id
     WHERE l.scope_type IN ('product', 'variant') AND l.archived_at IS NULL
    UNION ALL
    SELECT format('VolumeCommitment %s:%s', c.scope_type, c.scope_id)
      FROM public.volume_commitments c JOIN public.sale_sku_alias a ON a.target_sku = c.scope_id
     WHERE c.scope_type IN ('product', 'variant') AND c.archived_at IS NULL
    UNION ALL
    SELECT format('CompanyMercuriale %s ligne %s', m.id, l ->> 'sku')
      FROM public.company_mercuriales m
     CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(m.lines) = 'array' THEN m.lines ELSE '[]'::jsonb END) l
      JOIN public.sale_sku_alias a ON a.target_sku = l ->> 'sku'
     WHERE m.archived_at IS NULL
  ) x;
  IF report IS NOT NULL THEN
    RAISE EXCEPTION 'retour-arriere-defaut refusé, rien n''a été écrit : %', report
      USING HINT = 'Archiver ces décisions (ou remettre le défaut) avec le code de la bascule, puis rejouer ce fichier.';
  END IF;
END
$$;

UPDATE production.production_container c
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE c.sku = a.target_sku
   AND NOT EXISTS (SELECT 1 FROM production.production_container t WHERE t.sku = a.alias_sku);

UPDATE production.production_batch_shortcut s
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE s.sku = a.target_sku AND s.removed_at IS NULL;

UPDATE delivery.delivery_bin_capacity c
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE c.sku = a.target_sku
   AND NOT EXISTS (SELECT 1 FROM delivery.delivery_bin_capacity t
                    WHERE t.bin_type_id = c.bin_type_id AND t.sku = a.alias_sku);

UPDATE public.staff_suggestion_rules r
   SET suggested_skus = ARRAY(
         SELECT q.sku FROM (
           SELECT COALESCE(a.alias_sku, u.sku) AS sku, min(u.rank) AS rank
             FROM unnest(r.suggested_skus) WITH ORDINALITY AS u(sku, rank)
             LEFT JOIN public.sale_sku_alias a ON a.target_sku = u.sku
            GROUP BY 1) q
          ORDER BY q.rank)
 WHERE r.archived_at IS NULL
   AND r.suggested_skus && ARRAY(SELECT target_sku FROM public.sale_sku_alias);

UPDATE public.staff_suggestion_rules r
   SET trigger_ref = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE r.trigger_ref = a.target_sku
   AND r.trigger_kind IN ('product_in_cart', 'product_viewed')
   AND r.archived_at IS NULL;

UPDATE public.subscription_lines l
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE l.sku = a.target_sku;

UPDATE public.subscription_occurrences o
   SET lines = (
         SELECT jsonb_agg(CASE WHEN a.alias_sku IS NULL THEN e.line
                               ELSE jsonb_set(e.line, '{sku}', to_jsonb(a.alias_sku)) END
                          ORDER BY e.rank)
           FROM jsonb_array_elements(o.lines) WITH ORDINALITY AS e(line, rank)
           LEFT JOIN public.sale_sku_alias a ON a.target_sku = e.line ->> 'sku')
 WHERE jsonb_typeof(o.lines) = 'array'
   AND o.occurrence_date >= (now() AT TIME ZONE 'Europe/Paris')::date
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.lines) e
                 JOIN public.sale_sku_alias a ON a.target_sku = e ->> 'sku');

UPDATE public.bundle_choices c
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE c.sku = a.target_sku
   AND NOT EXISTS (SELECT 1 FROM public.bundle_choices t
                    WHERE t.bundle_id = c.bundle_id AND t.sku = a.alias_sku);

UPDATE public.product_norms n
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE n.sku = a.target_sku
   AND NOT EXISTS (SELECT 1 FROM public.product_norms t WHERE t.sku = a.alias_sku);

UPDATE public.site_stock_alert s
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE s.sku = a.target_sku AND s.lifted_at IS NULL;

UPDATE public.site_resupply_line l
   SET sku = a.alias_sku
  FROM public.sale_sku_alias a, public.site_resupply r
 WHERE l.sku = a.target_sku
   AND r.id = l.resupply_id
   AND r.cancelled_at IS NULL
   AND r.arrived_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM production.production_resupply p WHERE p.resupply_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM public.site_resupply_line t
                    WHERE t.resupply_id = l.resupply_id AND t.sku = a.alias_sku);

UPDATE public.bakehouse_resupply_drafts d
   SET lines = (
         SELECT jsonb_agg(CASE WHEN a.alias_sku IS NULL THEN e.line
                               ELSE jsonb_set(e.line, '{sku}', to_jsonb(a.alias_sku)) END
                          ORDER BY e.rank)
           FROM jsonb_array_elements(d.lines) WITH ORDINALITY AS e(line, rank)
           LEFT JOIN public.sale_sku_alias a ON a.target_sku = e.line ->> 'sku')
 WHERE d.status = 'open'
   AND jsonb_typeof(d.lines) = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.lines) e
                 JOIN public.sale_sku_alias a ON a.target_sku = e ->> 'sku');

UPDATE public.vitrine_fingerprints f
   SET element_key = a.alias_sku
  FROM public.sale_sku_alias a
 WHERE f.kind = 'item'
   AND f.element_key = a.target_sku
   AND NOT EXISTS (SELECT 1 FROM public.vitrine_fingerprints t
                    WHERE t.subscriber_id = f.subscriber_id AND t.kind = 'item'
                      AND t.element_key = a.alias_sku);

DELETE FROM public.sale_sku_alias;

COMMIT;
