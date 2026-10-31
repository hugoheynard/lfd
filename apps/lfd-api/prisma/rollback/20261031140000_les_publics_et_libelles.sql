-- RETOUR ARRIÈRE de 20261031140000_les_publics_et_libelles
-- (documentation/promotions/promotions.md, § 2.1,
-- « Ordre, portes, irréversibilité »).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE, AVANT le retour du code, puis l'API se REDÉMARRE (les
-- promotions sont lues sous le cache des matériaux de prix). La migration
-- reste inscrite « appliquée ».
--
-- Pourquoi AVANT : un code d'avant L8b relit `audience_kind = 'several'` par
-- `audienceOf`, qui ne le connaît pas — toute lecture des promotions casse,
-- caisse comprise.
--
-- Ce qu'il fait, dans une transaction :
--
-- 1. Chaque promotion `several` NON ARCHIVÉE est ramenée à sa PREMIÈRE cible
--    (ordre canonique : `kind`, puis `company_id`) et ARCHIVÉE, motif « retour
--    arrière L8b : publics réduits à <cible> ». Archivée, elle n'agit plus sur
--    aucun prix : la réduction ne change donc rien de servi. Le staff la
--    repose à la main, en jumelles, s'il y a lieu.
-- 2. Une promotion `several` déjà archivée est ramenée à sa première cible
--    sans autre geste : elle ne sert plus de prix, mais doit rester lisible.
-- 3. L'ancienne contrainte `promotions_audience_known` (sans `'several'`)
--    est recréée ; elle REFUSE si une ligne `several` avait survécu.
--
-- ⚠️ Ce qui est PERDU : le public complet des promotions réduites (il reste
-- dans `promotion_audience_targets`, que rien ne relit plus) ; les libellés
-- Particuliers / Pros, qu'un code d'avant L8b ignore (les colonnes restent) ;
-- `orders.discount_label`, que le PDF d'avant L8b ne lit pas — il retombe sur
-- « Remise retrait <point> ». La table et les colonnes RESTENT (CLAUDE.md §0).

SET lock_timeout = '5s';

BEGIN;

WITH firsts AS (
  SELECT DISTINCT ON (t.promotion_id) t.promotion_id, t.kind, t.company_id
    FROM public.promotion_audience_targets t
    JOIN public.promotions p ON p.id = t.promotion_id
   WHERE p.audience_kind = 'several'
   ORDER BY t.promotion_id, t.kind, t.company_id NULLS FIRST
)
UPDATE public.promotions p
   SET audience_kind = f.kind,
       audience_company_id = f.company_id,
       archived_at = coalesce(p.archived_at, CURRENT_TIMESTAMP),
       archived_by = coalesce(p.archived_by, 'system:retour-arriere-l8b'),
       archive_reason = coalesce(p.archive_reason,
         'retour arrière L8b : publics réduits à ' || f.kind
         || coalesce(' ' || f.company_id, ''))
  FROM firsts f
 WHERE p.id = f.promotion_id;

DO $$
DECLARE
  left_over text;
BEGIN
  SELECT string_agg(id, ', ' ORDER BY id) INTO left_over
    FROM public.promotions WHERE audience_kind = 'several';
  IF left_over IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'retour arrière L8b arrêté, rien n''a été écrit : ces promotions à plusieurs '
             || 'publics n''ont aucune cible à laquelle se réduire — ' || left_over,
      HINT = 'Leur poser une cible dans `promotion_audience_targets`, ou les archiver à l''écran '
          || 'avant le retour du code, puis rejouer ce fichier.';
  END IF;
END
$$;

ALTER TABLE public.promotions DROP CONSTRAINT promotions_audience_known;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_audience_known
  CHECK (audience_kind IN (
    'everyone', 'individuals', 'individuals_guest', 'individuals_registered',
    'pros', 'pros_active', 'pros_pending', 'company', 'company_and_sites',
    'everyone_but_active_pros'
  ));

COMMIT;
