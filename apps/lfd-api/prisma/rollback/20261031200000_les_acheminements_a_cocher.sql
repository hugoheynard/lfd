-- RETOUR ARRIÈRE de 20261031200000_les_acheminements_a_cocher
-- (documentation/promotions/plan-acheminements-a-cocher.md, § 8.4, § 9).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE, AVANT le retour du code, puis l'API se REDÉMARRE (les
-- promotions sont lues sous le cache des matériaux de prix). La migration
-- reste inscrite « appliquée ».
--
-- Pourquoi AVANT : le code d'avant relit `fulfillment_kind`, que le code
-- neuf n'écrit plus. Une promotion posée depuis le déploiement y porte
-- `NULL`, une promotion révisée y porte sa forme d'AVANT la révision — le
-- code d'avant refuserait la première et servirait la seconde fausse.
--
-- Ce qu'il fait, dans une transaction :
--
-- 1. Recalcule `fulfillment_kind` / `fulfillment_pickup_id` depuis la forme
--    neuve, pour CHAQUE promotion (archivées comprises : elles doivent rester
--    lisibles). Une forme que l'ancien modèle ne sait pas dire — un point ET
--    la livraison, plusieurs points, une sélection de zones — est réduite au
--    premier élément dans cet ordre : le premier point nommé (ordre des
--    identifiants), sinon « tous les points », sinon « livraison ».
-- 2. Chaque promotion ainsi RÉDUITE et NON ARCHIVÉE est archivée, motif
--    « retour arrière des acheminements à cocher : réduite à <forme> » :
--    archivée, elle n'agit plus sur aucun prix, la réduction ne sert donc
--    rien de faux. Le staff la repose à la main s'il y a lieu.
-- 3. `fulfillment_kind` redevient NOT NULL et le CHECK
--    `promotions_point_follows_fulfillment` est recréé ; il REFUSE si une
--    ligne avait échappé au point 1.
--
-- ⚠️ Ce qui est PERDU : la forme complète des promotions réduites (elle
-- reste dans les colonnes de mode et les tables de liaison, que rien ne
-- relit plus). Les tables, les colonnes et les CHECK neufs RESTENT (CLAUDE.md
-- § 0) : les CHECK neufs admettent tout ce que le code d'avant écrit — sauf
-- qu'il n'écrit pas les modes, et `promotions_point_follows_modes` refuserait
-- alors une promotion de panier qu'il poserait. Le point 4 le retire.
-- 4. `promotions_point_follows_modes` et `promotions_basket_reaches_something`
--    sont retirés ; `promotions_fulfillment_modes_known` reste (il admet NULL).

SET lock_timeout = '5s';

BEGIN;

WITH firsts AS (
  SELECT p.id,
         p.application_point,
         p.archived_at,
         (SELECT min(pp.pickup_id) FROM public.promotion_pickup_points pp WHERE pp.promotion_id = p.id)
           AS first_point,
         (SELECT count(*) FROM public.promotion_pickup_points pp WHERE pp.promotion_id = p.id)
           AS points,
         p.fulfillment_pickup,
         p.fulfillment_delivery
    FROM public.promotions p
), shaped AS (
  SELECT f.id, f.archived_at,
         CASE
           WHEN f.application_point = 'line' THEN 'any'
           WHEN f.fulfillment_pickup = 'listed' THEN 'pickup_point'
           WHEN f.fulfillment_pickup = 'all' THEN 'pickup'
           ELSE 'delivery'
         END AS kind,
         CASE WHEN f.application_point = 'basket' AND f.fulfillment_pickup = 'listed'
              THEN f.first_point END AS pickup_id,
         -- Réduite : l'ancien modèle ne disait qu'UN acheminement, et une
         -- livraison que « toutes les zones ».
         f.application_point = 'basket' AND (
           (f.fulfillment_pickup <> 'none' AND f.fulfillment_delivery <> 'none')
           OR f.points > 1
           OR f.fulfillment_delivery = 'listed'
         ) AS reduced
    FROM firsts f
)
UPDATE public.promotions p
   SET fulfillment_kind = s.kind,
       fulfillment_pickup_id = s.pickup_id,
       archived_at = CASE WHEN s.reduced AND p.archived_at IS NULL THEN CURRENT_TIMESTAMP ELSE p.archived_at END,
       archived_by = CASE WHEN s.reduced AND p.archived_at IS NULL THEN 'system:retour-acheminements' ELSE p.archived_by END,
       archive_reason = CASE WHEN s.reduced AND p.archived_at IS NULL
                             THEN 'retour arrière des acheminements à cocher : réduite à ' || s.kind
                                  || COALESCE(' (' || s.pickup_id || ')', '')
                             ELSE p.archive_reason END
  FROM shaped s
 WHERE s.id = p.id;

ALTER TABLE public.promotions ALTER COLUMN fulfillment_kind SET NOT NULL;

ALTER TABLE public.promotions
  DROP CONSTRAINT promotions_point_follows_modes,
  DROP CONSTRAINT promotions_basket_reaches_something;

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_point_follows_fulfillment
    CHECK ((application_point = 'basket') = (fulfillment_kind <> 'any'));

COMMIT;
