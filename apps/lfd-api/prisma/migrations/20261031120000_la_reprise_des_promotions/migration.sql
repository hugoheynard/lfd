-- LA REPRISE DES PROMOTIONS — lot L4 de
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md
-- (§ 13.4, corrigé par la contradiction n° 2, § 14).
--
-- Trois choses, dans cette transaction :
--
-- 1. `public.promotion_settings` et sa seule ligne, `promotions_source` =
--    `legacy` : la source que le calcul lira (§ 13.5). Personne ne la lit dans
--    ce lot — le calcul lit l'ancien chemin, AUCUN PRIX NE CHANGE. La migration
--    de la bascule (L8) la passera à `promotions` dans la transaction de son
--    contrôle d'égalité.
-- 2. `public.reprise_des_promotions()`, REJOUABLE : elle recopie en promotions
--    (a) toutes les règles de prix d'étage `promotion`, archivées comprises
--    (§ 14 B1), id conservé, et (b) les remises de retrait des sites non
--    archivés, une par site et par clientèle remisée (§ 14 B3, B4).
--    Pré-contrôle et contrôle de fin lèvent une exception qui NOMME les cas :
--    rien n'est écrit si l'un d'eux échoue.
-- 3. Son premier appel.
--
-- PAS de gel des sources (abandonné le 2026-10-30, mandat de Hugo — § 14 B2) :
-- les anciens éditeurs restent ouverts jusqu'à la bascule, et la migration de
-- L8 REJOUE cette fonction avant son contrôle d'égalité. Le rejeu rattrape donc
-- la dérive : une règle archivée ou remplacée suit (archivée + nouvelle), une
-- remise de site disparue archive sa promotion (§ 2 bis ci-dessous).
--
-- ADDITIVE : une table neuve, une fonction, des lignes dans `promotions`,
-- `promotion_scope_rules` et `pricing_events`. Les sources (`price_rules`,
-- `pickup_addresses`, `pickup_discount_rules`) ne sont que LUES. Aucun droit
-- accordé.
--
-- ⚠️ Deux écarts à la lettre du § 13.4, tous deux plus stricts :
-- - le refus de `increase` / `segment` vise aussi les règles ARCHIVÉES : la
--   reprise les prend (§ 14 B1), et une hausse reprise en `percent_off`
--   serait devenue une baisse ;
-- - le contrôle de fin refuse aussi une promotion reprise que l'agrégat
--   refuserait au chargement (« seulement » sans inclusion, famille à
--   contre-sens du mode) : une remise de site écrite avant le 2026-10-23 peut
--   en porter une (`PickupDiscount.restore`), et la recopier aurait rendu sa
--   promotion illisible au premier chargement.
--
-- Retour arrière : prisma/rollback/20261031120000_la_reprise_des_promotions.sql
-- (archiver, jamais supprimer).

-- `promotions` et `pricing_events` sont écrites par des gestes du staff :
-- mieux vaut un déploiement qui échoue proprement en 5 s qu'une file bloquée.
SET lock_timeout = '5s';

CREATE TABLE "public"."promotion_settings" (
  "key"        TEXT           NOT NULL,
  "value"      TEXT           NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promotion_settings_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "promotion_settings_key_known" CHECK ("key" IN ('promotions_source')),
  CONSTRAINT "promotion_settings_source_known" CHECK (
    "key" <> 'promotions_source' OR "value" IN ('legacy', 'shadow', 'promotions')
  )
);

INSERT INTO "public"."promotion_settings" ("key", "value")
VALUES ('promotions_source', 'legacy')
ON CONFLICT ("key") DO NOTHING;

-- Le jour civil à Paris, en toutes lettres : « 1er novembre 2026 ».
CREATE OR REPLACE FUNCTION public.reprise_des_promotions_jour(instant timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN extract(day FROM l) = 1 THEN '1er' ELSE extract(day FROM l)::int::text END
         || ' ' || (ARRAY['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                          'septembre', 'octobre', 'novembre', 'décembre'])[extract(month FROM l)::int]
         || ' ' || extract(year FROM l)::int::text
    FROM (SELECT instant AT TIME ZONE 'Europe/Paris' AS l) AS local
$$;

-- La phrase figée d'un acte, l'écriture de `describePromotion`
-- (src/b2b/promotions/domain/promotion-act.ts) : effet · public ·
-- acheminement · fenêtre, le jour civil à Paris en toutes lettres.
CREATE OR REPLACE FUNCTION public.reprise_des_promotions_phrase(p public.promotions)
RETURNS text LANGUAGE sql STABLE AS $$
  WITH parts AS (
    SELECT
      CASE p.effect_kind
        WHEN 'percent_off' THEN '−' || replace(trim_scale(p.effect_value / 100.0)::text, '.', ',') || ' %'
        WHEN 'unit_amount_off' THEN '−' || replace(to_char(p.effect_value / 100000.0, 'FM999999990.00'), '.', ',') || ' € à l''unité'
        WHEN 'fixed_unit_price' THEN 'prix posé ' || replace(to_char(p.effect_value / 100000.0, 'FM999999990.00'), '.', ',') || ' €'
        ELSE '−' || replace(to_char(p.effect_value / 100.0, 'FM999999990.00'), '.', ',') || ' € sur le panier'
      END AS effect,
      CASE p.audience_kind
        WHEN 'everyone' THEN 'tout le monde'
        WHEN 'pros_active' THEN 'pros actifs'
        WHEN 'everyone_but_active_pros' THEN 'tous sauf les pros actifs'
        WHEN 'company' THEN 'une société (' || p.audience_company_id || ')'
        ELSE p.audience_kind
      END AS audience,
      CASE p.fulfillment_kind
        WHEN 'any' THEN 'tous acheminements'
        WHEN 'pickup_point' THEN 'retrait au point ' || p.fulfillment_pickup_id
        ELSE p.fulfillment_kind
      END AS fulfillment
  )
  SELECT parts.effect || ' · ' || parts.audience || ' · ' || parts.fulfillment || ' · '
         || 'du ' || public.reprise_des_promotions_jour(p.valid_from)
         || CASE WHEN p.valid_to IS NULL THEN ', sans date de fin'
                 ELSE ' au ' || public.reprise_des_promotions_jour(p.valid_to) END
    FROM parts
$$;

CREATE OR REPLACE FUNCTION public.reprise_des_promotions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  reprise_actor CONSTANT text := 'system:reprise-promotions';
  refused text;
  defects text;
  orphans bigint;
  known text[];
BEGIN
  -- ── PRÉ-CONTRÔLE ────────────────────────────────────────────────────────
  -- Inexprimables : une hausse, une audience segment — archivées comprises.
  SELECT string_agg(format('%s « %s » (%s)', r.id, r.label,
                           CASE WHEN r.audience_type = 'segment' THEN 'audience segment' ELSE 'hausse' END),
                    ', ' ORDER BY r.id)
    INTO refused
    FROM public.price_rules r
   WHERE r.stage = 'promotion'
     AND (r.direction = 'increase' OR r.audience_type = 'segment');
  IF refused IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'reprise des promotions arrêtée au pré-contrôle, rien n''a été écrit : '
             || 'des règles d''étage promotion ne s''expriment pas en promotion — ' || refused,
      HINT = 'Une promotion ne hausse pas un prix et ne vise pas un segment (plan des promotions, '
          || '§ 13.2). Décider avec Hugo du sort de ces règles avant de rejouer la reprise.';
  END IF;

  -- Une portée produit et une portée déclinaison sur le même SKU, même audience,
  -- fenêtres chevauchantes, non archivées : elles se disputeraient au même rang.
  SELECT string_agg(format('%s (product) × %s (variant) sur %s', p.id, v.id, p.scope_id),
                    ', ' ORDER BY p.id, v.id)
    INTO refused
    FROM public.price_rules p
    JOIN public.price_rules v
      ON v.scope_type = 'variant' AND v.scope_id = p.scope_id
     AND v.audience_type = p.audience_type
     AND v.audience_id IS NOT DISTINCT FROM p.audience_id
     AND v.stage = 'promotion' AND v.archived_at IS NULL
     AND tstzrange(v.valid_from, v.valid_to) && tstzrange(p.valid_from, p.valid_to)
   WHERE p.scope_type = 'product' AND p.stage = 'promotion' AND p.archived_at IS NULL;
  IF refused IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'reprise des promotions arrêtée au pré-contrôle, rien n''a été écrit : '
             || 'des règles produit et déclinaison se disputent un même article — ' || refused,
      HINT = 'Archiver l''une des deux, ou décider avec Hugo, avant de rejouer la reprise.';
  END IF;

  -- Information seulement : la cible `product` n'a pas besoin du catalogue.
  SELECT count(*) INTO orphans
    FROM public.pickup_discount_rules r
   WHERE r.target = 'product'
     AND NOT EXISTS (SELECT 1 FROM public.catalog_items c WHERE c.product_id = r.target_id);
  IF orphans > 0 THEN
    RAISE NOTICE 'reprise des promotions : % règle(s) de remise de retrait visent un produit '
                 'absent du catalogue, reprises telles quelles', orphans;
  END IF;

  SELECT COALESCE(array_agg(legacy_source), '{}') INTO known
    FROM public.promotions WHERE legacy_source IS NOT NULL;

  -- ── 1. LES RÈGLES D'ÉTAGE PROMOTION, archivées comprises ────────────────
  INSERT INTO public.promotions AS t (id, internal_name, label_fr, application_point,
    effect_kind, effect_value, stacks_over_mercuriale, valid_from, valid_to,
    paused_at, paused_by, archived_at, archived_by, archive_reason,
    audience_kind, audience_company_id, fulfillment_kind, scope_mode, conditions,
    origin, legacy_source, created_by, created_at)
  SELECT r.id, r.label, r.label, 'line',
    CASE WHEN r.nature = 'replace' THEN 'fixed_unit_price'
         WHEN r.mode = 'percent' THEN 'percent_off' ELSE 'unit_amount_off' END,
    CASE WHEN r.nature = 'replace' THEN r.amount_millicents ELSE r.value END,
    r.stacks_over_mercuriale, r.valid_from, r.valid_to, r.paused_at, r.paused_by,
    r.archived_at, r.archived_by,
    -- Une règle s'archive sans motif ; une promotion, jamais (CHECK, agrégat).
    CASE WHEN r.archived_at IS NULL THEN NULL
         ELSE COALESCE(NULLIF(btrim(r.archive_reason), ''), 'archivée sans motif, avant la reprise') END,
    CASE r.audience_type WHEN 'all' THEN 'everyone' ELSE 'company' END,
    CASE r.audience_type WHEN 'all' THEN NULL ELSE r.audience_id END,
    'any',
    CASE WHEN r.scope_type = 'global' THEN 'all_except' ELSE 'only' END,
    CASE WHEN r.min_quantity IS NULL THEN '[]'::jsonb
         ELSE jsonb_build_array(jsonb_build_object('kind', 'min_quantity', 'value', r.min_quantity)) END,
    jsonb_strip_nulls(jsonb_build_object('kind', 'price_rule', 'ruleId', r.id,
      'floor', CASE WHEN r.floor_mode IS NULL THEN NULL
                    ELSE jsonb_build_object('mode', r.floor_mode, 'value', r.floor_value) END,
      'detached', r.origin)),
    'price_rule:' || r.id, r.created_by,
    -- `price_rules.created_at` est sans fuseau, écrit en UTC par Prisma.
    r.created_at AT TIME ZONE 'UTC'
  FROM public.price_rules r
  WHERE r.stage = 'promotion'
  ON CONFLICT (legacy_source) DO UPDATE SET
    internal_name = EXCLUDED.internal_name, label_fr = EXCLUDED.label_fr,
    application_point = EXCLUDED.application_point, effect_kind = EXCLUDED.effect_kind,
    effect_value = EXCLUDED.effect_value, stacks_over_mercuriale = EXCLUDED.stacks_over_mercuriale,
    valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to,
    paused_at = EXCLUDED.paused_at, paused_by = EXCLUDED.paused_by,
    archived_at = EXCLUDED.archived_at, archived_by = EXCLUDED.archived_by,
    archive_reason = EXCLUDED.archive_reason, audience_kind = EXCLUDED.audience_kind,
    audience_company_id = EXCLUDED.audience_company_id,
    fulfillment_kind = EXCLUDED.fulfillment_kind, scope_mode = EXCLUDED.scope_mode,
    conditions = EXCLUDED.conditions, origin = EXCLUDED.origin,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at;

  -- ── 2. LES REMISES DE RETRAIT, sites non archivés ───────────────────────
  -- Le prédicat du lecteur d'aujourd'hui (`discountsOf` → `fromAdjustmentColumns`),
  -- plus `valeur > 0` : une remise nulle n'a aucun effet et le CHECK la refuse.
  INSERT INTO public.promotions AS t (id, internal_name, label_fr, application_point,
    effect_kind, effect_value, valid_from, audience_kind, fulfillment_kind,
    fulfillment_pickup_id, scope_mode, origin, legacy_source, created_by, created_at)
  SELECT 'pd_' || s.id || '_' || d.clientele,
    'Remise de retrait — ' || s.label || CASE d.clientele WHEN 'b2b' THEN ' · pros' ELSE ' · particuliers' END,
    'Remise de retrait — ' || s.label,
    'basket',
    CASE d.mode WHEN 'percent' THEN 'percent_off' ELSE 'basket_amount_off' END,
    d.value,
    -- `pickup_addresses.created_at` est sans fuseau, écrit en UTC par Prisma.
    s.created_at AT TIME ZONE 'UTC',
    CASE d.clientele WHEN 'b2b' THEN 'pros_active' ELSE 'everyone_but_active_pros' END,
    'pickup_point', s.id, d.scope,
    jsonb_build_object('kind', 'pickup_discount', 'siteId', s.id, 'clientele', d.clientele),
    'pickup_discount:' || s.id || ':' || d.clientele,
    reprise_actor, CURRENT_TIMESTAMP
  FROM public.pickup_addresses s
  CROSS JOIN LATERAL (VALUES
    ('b2b', s.discount_mode::text, s.discount_value, s.discount_scope::text, s.discount_for_b2b),
    ('b2c', s.b2c_discount_mode::text, s.b2c_discount_value, s.b2c_discount_scope::text, true)
  ) AS d(clientele, mode, value, scope, served)
  WHERE s.archived_at IS NULL AND d.served
    AND d.mode IS NOT NULL AND d.value IS NOT NULL AND d.value > 0
  ON CONFLICT (legacy_source) DO UPDATE SET
    internal_name = EXCLUDED.internal_name, label_fr = EXCLUDED.label_fr,
    effect_kind = EXCLUDED.effect_kind, effect_value = EXCLUDED.effect_value,
    valid_from = EXCLUDED.valid_from, valid_to = NULL,
    paused_at = NULL, paused_by = NULL,
    archived_at = NULL, archived_by = NULL, archive_reason = NULL,
    audience_kind = EXCLUDED.audience_kind, fulfillment_kind = EXCLUDED.fulfillment_kind,
    fulfillment_pickup_id = EXCLUDED.fulfillment_pickup_id, scope_mode = EXCLUDED.scope_mode,
    origin = EXCLUDED.origin;

  -- ── 2 bis. LES REMISES DISPARUES DEPUIS UN APPEL PRÉCÉDENT ──────────────
  -- Site archivé, remise retirée, mise à zéro ou rendue incomplète : la
  -- promotion reprise s'archive (jamais de DELETE) — aucun éditeur n'est gelé
  -- entre L4 et L8, c'est le rejeu qui rattrape la dérive. Un rejeu suivant
  -- la DÉSARCHIVE si la remise revient (`DO UPDATE` ci-dessus).
  WITH gone AS (
  UPDATE public.promotions p
     SET archived_at = CURRENT_TIMESTAMP,
         archived_by = reprise_actor,
         archive_reason = 'remise de retrait retirée à la source'
   WHERE p.legacy_source LIKE 'pickup\_discount:%'
     AND p.archived_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.pickup_addresses s
        CROSS JOIN LATERAL (VALUES
          ('b2b', s.discount_mode IS NOT NULL AND s.discount_value > 0 AND s.discount_for_b2b),
          ('b2c', s.b2c_discount_mode IS NOT NULL AND s.b2c_discount_value > 0)
        ) AS d(clientele, served)
        WHERE s.archived_at IS NULL AND d.served
          AND p.legacy_source = 'pickup_discount:' || s.id || ':' || d.clientele)
  RETURNING p.*)
  -- Son acte, une fois par archivage (l'id porte l'instant).
  INSERT INTO public.pricing_events (id, subject_type, subject_id, act, actor, occurred_at, reason, summary)
  SELECT 'reprise:archived:' || g.id || ':' || to_char(g.archived_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSMS'),
         'promotion', g.id, 'archived', reprise_actor, g.archived_at, g.archive_reason,
         public.reprise_des_promotions_phrase(g::public.promotions)
    FROM gone g
  ON CONFLICT (id) DO NOTHING;

  -- ── LA PORTÉE, remplacée en bloc ────────────────────────────────────────
  -- Des valeurs de la portée, sans histoire propre (comme le dépôt) ; jamais
  -- celles d'une promotion saisie. Une remise de retrait archivée parce que sa
  -- source a disparu GARDE la portée qu'elle avait : la source n'en dit plus
  -- rien, et la relire la rendrait illisible (« seulement » vidé).
  DELETE FROM public.promotion_scope_rules sr
   USING public.promotions p
   WHERE sr.promotion_id = p.id AND p.legacy_source IS NOT NULL
     AND (p.legacy_source LIKE 'price\_rule:%' OR p.archived_at IS NULL);

  INSERT INTO public.promotion_scope_rules (id, promotion_id, target, target_id, target_rank, eligible)
  SELECT r.id || ':' || x.target || ':' || r.scope_id, r.id, x.target, r.scope_id, x.rank, true
    FROM public.price_rules r
    CROSS JOIN LATERAL (SELECT
      CASE r.scope_type WHEN 'category' THEN 'category' ELSE 'variant' END AS target,
      CASE r.scope_type WHEN 'product' THEN 2 ELSE NULL END AS rank) AS x
   WHERE r.stage = 'promotion' AND r.scope_type <> 'global';

  INSERT INTO public.promotion_scope_rules (id, promotion_id, target, target_id, target_rank, eligible)
  SELECT p.id || ':' || r.target::text || ':' || r.target_id, p.id, r.target::text, r.target_id,
         NULL, r.eligible
    FROM public.promotions p
    JOIN public.pickup_discount_rules r
      ON p.legacy_source = 'pickup_discount:' || r.site_id || ':' || r.audience::text
   WHERE p.archived_at IS NULL;

  -- ── 4. LE JOURNAL : un `posed` par promotion CRÉÉE par cet appel, plus
  -- `archived` pour une règle archivée. Un rejeu sans dérive n'en écrit aucun.
  INSERT INTO public.pricing_events (id, subject_type, subject_id, act, actor, occurred_at, reason, summary)
  SELECT 'reprise:posed:' || p.id, 'promotion', p.id, 'posed', reprise_actor,
         -- Posée quand sa source l'a été : l'acte précède un éventuel archivage.
         p.created_at, 'reprise des promotions', public.reprise_des_promotions_phrase(p)
    FROM public.promotions p
   WHERE p.legacy_source IS NOT NULL AND NOT (p.legacy_source = ANY (known))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pricing_events (id, subject_type, subject_id, act, actor, occurred_at, reason, summary)
  -- Toute règle reprise archivée reçoit le sien, une fois : à la création, ou
  -- au rejeu qui suit son archivage dans l'ancien éditeur (règle remplacée).
  SELECT 'reprise:archived:' || p.id, 'promotion', p.id, 'archived', reprise_actor,
         p.archived_at, 'reprise des promotions', public.reprise_des_promotions_phrase(p)
    FROM public.promotions p
   WHERE p.legacy_source LIKE 'price\_rule:%'
     AND p.archived_at IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. LE CONTRÔLE DE FIN ───────────────────────────────────────────────
  SELECT concat_ws(' ; ',
    (SELECT CASE WHEN a.n <> b.n THEN format('%s règles d''étage promotion, %s promotions reprises', a.n, b.n) END
       FROM (SELECT count(*) n FROM public.price_rules WHERE stage = 'promotion') a,
            (SELECT count(*) n FROM public.promotions WHERE legacy_source LIKE 'price\_rule:%') b),
    (SELECT CASE WHEN a.n <> b.n THEN format('%s règles archivées, %s promotions reprises archivées', a.n, b.n) END
       FROM (SELECT count(*) n FROM public.price_rules WHERE stage = 'promotion' AND archived_at IS NOT NULL) a,
            (SELECT count(*) n FROM public.promotions
              WHERE legacy_source LIKE 'price\_rule:%' AND archived_at IS NOT NULL) b),
    (SELECT CASE WHEN a.n <> b.n THEN format('%s remises de retrait servies, %s promotions de retrait vivantes', a.n, b.n) END
       FROM (SELECT count(*) n FROM public.pickup_addresses s
               CROSS JOIN LATERAL (VALUES (s.discount_mode IS NOT NULL AND s.discount_value > 0 AND s.discount_for_b2b),
                                          (s.b2c_discount_mode IS NOT NULL AND s.b2c_discount_value > 0)) AS d(served)
              WHERE s.archived_at IS NULL AND d.served) a,
            (SELECT count(*) n FROM public.promotions
              WHERE legacy_source LIKE 'pickup\_discount:%' AND archived_at IS NULL) b),
    (SELECT 'portée différente de sa source : ' || string_agg(p.id, ', ' ORDER BY p.id)
       FROM public.promotions p
      WHERE p.legacy_source IS NOT NULL
        AND (p.legacy_source LIKE 'price\_rule:%' OR p.archived_at IS NULL)
        AND (SELECT count(*) FROM public.promotion_scope_rules sr WHERE sr.promotion_id = p.id)
            <> CASE WHEN p.origin ->> 'kind' = 'price_rule'
                    THEN (SELECT count(*) FROM public.price_rules r
                           WHERE r.id = p.id AND r.scope_type <> 'global')
                    ELSE (SELECT count(*) FROM public.pickup_discount_rules r
                           WHERE p.legacy_source = 'pickup_discount:' || r.site_id || ':' || r.audience::text)
               END),
    (SELECT '« seulement » sans inclusion : ' || string_agg(p.id, ', ' ORDER BY p.id)
       FROM public.promotions p
      WHERE p.legacy_source IS NOT NULL AND p.scope_mode = 'only'
        AND NOT EXISTS (SELECT 1 FROM public.promotion_scope_rules sr
                         WHERE sr.promotion_id = p.id AND sr.eligible)),
    (SELECT 'famille à contre-sens du mode : ' || string_agg(DISTINCT p.id || ' (' || sr.target_id || ')', ', ')
       FROM public.promotions p
       JOIN public.promotion_scope_rules sr ON sr.promotion_id = p.id
      WHERE p.legacy_source IS NOT NULL
        AND sr.target = 'category' AND sr.eligible <> (p.scope_mode = 'only'))
  ) INTO defects;
  IF defects IS NOT NULL AND defects <> '' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'reprise des promotions arrêtée au contrôle de fin, rien n''a été écrit : ' || defects,
      HINT = 'Corriger la source nommée (la remise du site, à l''écran des sites), puis rejouer '
          || '`SELECT public.reprise_des_promotions()`. Le pré-contrôle L0 les liste.';
  END IF;
END
$$;

SELECT public.reprise_des_promotions();
