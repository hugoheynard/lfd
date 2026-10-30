-- LA BASCULE DES PROMOTIONS — lot L8 de
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md
-- (§ 13.4, § 13.5, § 13.10 ; § 14 B2 révisé, B5, S-bascule).
--
-- Dans CETTE transaction, et dans cet ordre :
--
-- 1. `orders.discount_promotion_id` (text NULL) : la promotion panier qui a
--    produit la remise d'une commande — lue par la révision au lot L9.
--    Additive : aucune ligne écrite, aucune contrainte.
-- 2. `public.controle_des_promotions()` : l'égalité sources ↔ promotions,
--    champ par champ. Elle n'ÉCRIT RIEN ; un écart lève une exception qui
--    NOMME chaque promotion fautive, et la transaction entière est défaite.
-- 3. `public.bascule_des_promotions()` : REJOUE la reprise
--    (`reprise_des_promotions()`, migration 20261031120000 — les anciens
--    éditeurs sont restés ouverts jusqu'ici, § 14 B2 révisé : le rejeu
--    rattrape leur dérive), PUIS contrôle, PUIS passe `promotions_source` à
--    `promotions`. La bascule n'existe donc que si le contrôle a tenu, et
--    aucun déploiement ne peut servir le nouveau chemin sans la reprise.
-- 4. Son appel.
--
-- Les sources (`price_rules`, `pickup_addresses`, `pickup_discount_rules`) ne
-- sont que LUES. Aucun droit accordé. Une colonne ajoutée, deux fonctions,
-- une ligne de configuration modifiée.
--
-- 🔴 Prix servis : identiques au centime — l'e2e d'égalité
-- (`test/promotions-equality.e2e-spec.ts`) les compare en `legacy` puis en
-- `promotions` sur le même corpus, et `test/promotions-bascule.e2e-spec.ts`
-- rejoue cette migration.
--
-- Retour arrière : prisma/rollback/20261031130000_la_bascule_des_promotions.sql
-- (remettre la ligne à `legacy` ; la colonne reste).

SET lock_timeout = '5s';

ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "discount_promotion_id" TEXT;

-- L'égalité, en lecture seule. Ce que la reprise écrit par construction est
-- relu ici par un autre chemin : une promotion modifiée à la main, une source
-- que le rejeu n'aurait pas suivie, ou un défaut de la reprise elle-même.
CREATE OR REPLACE FUNCTION public.controle_des_promotions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  defects text;
BEGIN
  WITH rule_scope AS (
    SELECT r.id,
           COALESCE((SELECT string_agg(x, ',' ORDER BY x) FROM (
             SELECT CASE r.scope_type WHEN 'category' THEN 'category' ELSE 'variant' END
                    || ':' || r.scope_id || ':'
                    || CASE r.scope_type WHEN 'product' THEN '2' ELSE '' END || ':true' AS x
              WHERE r.scope_type <> 'global') s), '') AS expected
      FROM public.price_rules r
     WHERE r.stage = 'promotion'
  ), promotion_scope AS (
    SELECT p.id,
           COALESCE((SELECT string_agg(sr.target || ':' || sr.target_id || ':'
                                       || COALESCE(sr.target_rank::text, '') || ':' || sr.eligible::text,
                                       ',' ORDER BY sr.target || ':' || sr.target_id || ':'
                                       || COALESCE(sr.target_rank::text, '') || ':' || sr.eligible::text)
                       FROM public.promotion_scope_rules sr WHERE sr.promotion_id = p.id), '') AS actual
      FROM public.promotions p
     WHERE p.legacy_source IS NOT NULL
  ), rules AS (
    SELECT r.id || CASE
             WHEN p.id IS NULL THEN ' (aucune promotion reprise)'
             WHEN p.application_point <> 'line' OR p.fulfillment_kind <> 'any' THEN ' (point)'
             WHEN p.effect_kind <> CASE WHEN r.nature = 'replace' THEN 'fixed_unit_price'
                                        WHEN r.mode = 'percent' THEN 'percent_off'
                                        ELSE 'unit_amount_off' END
               OR p.effect_value IS DISTINCT FROM
                  CASE WHEN r.nature = 'replace' THEN r.amount_millicents ELSE r.value END
               THEN ' (effet)'
             WHEN p.valid_from <> r.valid_from OR p.valid_to IS DISTINCT FROM r.valid_to
               THEN ' (fenêtre)'
             WHEN p.paused_at IS DISTINCT FROM r.paused_at THEN ' (pause)'
             WHEN p.archived_at IS DISTINCT FROM r.archived_at THEN ' (archivage)'
             WHEN p.stacks_over_mercuriale <> r.stacks_over_mercuriale THEN ' (mercuriale)'
             WHEN p.audience_kind <> CASE r.audience_type WHEN 'all' THEN 'everyone' ELSE 'company' END
               OR p.audience_company_id IS DISTINCT FROM
                  CASE r.audience_type WHEN 'all' THEN NULL ELSE r.audience_id END
               THEN ' (public)'
             WHEN p.conditions <> CASE WHEN r.min_quantity IS NULL THEN '[]'::jsonb
                    ELSE jsonb_build_array(jsonb_build_object('kind', 'min_quantity',
                                                              'value', r.min_quantity)) END
               THEN ' (quantité minimum)'
             WHEN p.scope_mode <> CASE WHEN r.scope_type = 'global' THEN 'all_except' ELSE 'only' END
               OR rs.expected <> ps.actual THEN ' (portée)'
           END AS defect
      FROM public.price_rules r
      JOIN rule_scope rs ON rs.id = r.id
      LEFT JOIN public.promotions p ON p.legacy_source = 'price_rule:' || r.id
      LEFT JOIN promotion_scope ps ON ps.id = p.id
     WHERE r.stage = 'promotion'
  ), served AS (
    SELECT s.id AS site_id, d.clientele, d.mode, d.value, d.scope
      FROM public.pickup_addresses s
     CROSS JOIN LATERAL (VALUES
       ('b2b', s.discount_mode::text, s.discount_value, s.discount_scope::text, s.discount_for_b2b),
       ('b2c', s.b2c_discount_mode::text, s.b2c_discount_value, s.b2c_discount_scope::text, true)
     ) AS d(clientele, mode, value, scope, offered)
     WHERE s.archived_at IS NULL AND d.offered
       AND d.mode IS NOT NULL AND d.value IS NOT NULL AND d.value > 0
  ), sites AS (
    SELECT 'pd_' || v.site_id || '_' || v.clientele || CASE
             WHEN p.id IS NULL THEN ' (aucune promotion reprise)'
             WHEN p.archived_at IS NOT NULL THEN ' (archivée, la remise est servie)'
             WHEN p.paused_at IS NOT NULL OR p.valid_to IS NOT NULL THEN ' (fenêtre ou pause)'
             WHEN p.application_point <> 'basket' OR p.fulfillment_kind <> 'pickup_point'
               OR p.fulfillment_pickup_id IS DISTINCT FROM v.site_id THEN ' (point de retrait)'
             WHEN p.effect_kind <> CASE v.mode WHEN 'percent' THEN 'percent_off' ELSE 'basket_amount_off' END
               OR p.effect_value <> v.value THEN ' (effet)'
             WHEN p.audience_kind <> CASE v.clientele WHEN 'b2b' THEN 'pros_active'
                                                      ELSE 'everyone_but_active_pros' END
               THEN ' (public)'
             WHEN p.conditions <> '[]'::jsonb THEN ' (conditions)'
             WHEN p.scope_mode <> v.scope
               OR COALESCE((SELECT string_agg(r.target::text || ':' || r.target_id || '::'
                                              || r.eligible::text,
                                              ',' ORDER BY r.target::text || ':' || r.target_id
                                              || '::' || r.eligible::text)
                              FROM public.pickup_discount_rules r
                             WHERE r.site_id = v.site_id AND r.audience::text = v.clientele), '')
                  <> ps.actual THEN ' (portée)'
           END AS defect
      FROM served v
      LEFT JOIN public.promotions p
        ON p.legacy_source = 'pickup_discount:' || v.site_id || ':' || v.clientele
      LEFT JOIN promotion_scope ps ON ps.id = p.id
  ), orphans AS (
    SELECT p.id || ' (vivante, sa remise n''est plus servie)' AS defect
      FROM public.promotions p
     WHERE p.legacy_source LIKE 'pickup\_discount:%' AND p.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM served v
                        WHERE p.legacy_source = 'pickup_discount:' || v.site_id || ':' || v.clientele)
  )
  SELECT string_agg(defect, ', ' ORDER BY defect) INTO defects
    FROM (SELECT defect FROM rules UNION ALL SELECT defect FROM sites
          UNION ALL SELECT defect FROM orphans) AS all_defects
   WHERE defect IS NOT NULL;

  IF defects IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'bascule des promotions arrêtée au contrôle d''égalité, rien n''a été écrit : '
             || 'des promotions reprises diffèrent de leur source — ' || defects,
      HINT = 'Le calcul lit toujours l''ancien chemin. Corriger la source ou la promotion nommée '
          || '(une promotion reprise ne se modifie pas à la main), puis rejouer '
          || '`SELECT public.bascule_des_promotions()`.';
  END IF;
END
$$;

-- Rejouer, contrôler, basculer : l'ordre est la garantie.
CREATE OR REPLACE FUNCTION public.bascule_des_promotions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.reprise_des_promotions();
  PERFORM public.controle_des_promotions();
  UPDATE public.promotion_settings
     SET value = 'promotions', updated_at = CURRENT_TIMESTAMP
   WHERE key = 'promotions_source';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = 'bascule des promotions arrêtée : la ligne `promotions_source` manque, rien n''a été écrit',
      HINT = 'Elle est posée par la migration 20261031120000_la_reprise_des_promotions.';
  END IF;
END
$$;

SELECT public.bascule_des_promotions();
