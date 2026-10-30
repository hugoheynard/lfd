-- Le resserrement des promotions — plan
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md,
-- § 13.10, lot L12.
--
-- L'ancien chemin de calcul (règles d'étage promotion, remise des sites) est
-- retiré du code dans le même passage. Cette migration n'efface rien :
--
-- 1. GARDE-FOU : une base qui n'a pas basculé (`promotions_source` ≠
--    `promotions`) refuse ce déploiement, en le disant. Plus aucun code ne
--    sait servir `legacy` ni `shadow`.
-- 2. La ligne `promotions_source` reste lisible, mais son CHECK ne connaît
--    plus que `promotions` : personne ne peut la remettre à une valeur que le
--    code ne sert plus. (Le retour arrière de L4/L8, qui la remettait à
--    `legacy`, n'est plus jouable : il est périmé par ce lot.)
-- 3. `reprise_des_promotions()` est neutralisée : après la bascule, elle
--    réécrirait des promotions éditées par l'équipe à partir de sources que
--    plus rien ne lit. Elle refuse désormais, en nommant l'écran Promotions.
-- 4. Les règles d'étage promotion encore vivantes sont ARCHIVÉES (motif daté,
--    acte au journal des prix) : aucune ne s'écrit ni n'agit plus depuis la
--    bascule, et l'écran des règles ne doit plus les montrer comme en
--    vigueur. Les promotions reprises gardent leur propre fenêtre et leur
--    propre archivage : rien de ce qu'elles servent ne change.
--
-- Colonnes gardées (aucun DROP) : `pickup_addresses.discount_*`,
-- `pickup_discount_rules`, `price_rules` d'étage promotion, la table
-- `promotion_settings`. Leur retrait éventuel est un autre passage.
--
-- Réversible : le CHECK se rélargit, la fonction se remet par la migration
-- 20261031120000 (CREATE OR REPLACE), un archivage de règle se défait par
-- `archived_at = NULL` — rien n'est supprimé.

SET lock_timeout = '5s';

-- ── 1. LE GARDE-FOU ─────────────────────────────────────────────────────────
DO $$
DECLARE
  current_source text;
BEGIN
  SELECT value INTO current_source
    FROM public.promotion_settings
   WHERE key = 'promotions_source';
  IF current_source IS DISTINCT FROM 'promotions' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'resserrement des promotions arrêté, rien n''a été écrit : la source vaut « '
             || COALESCE(current_source, 'absente')
             || ' », et ce déploiement retire l''ancien chemin de calcul.',
      HINT = 'Jouer d''abord la bascule (`SELECT public.bascule_des_promotions()`, migration '
          || '20261031130000), qui contrôle l''égalité et pose « promotions », puis redéployer.';
  END IF;
END $$;

-- ── 2. LA LIGNE NE CONNAÎT PLUS QUE `promotions` ────────────────────────────
ALTER TABLE "public"."promotion_settings"
  DROP CONSTRAINT "promotion_settings_source_known";
ALTER TABLE "public"."promotion_settings"
  ADD CONSTRAINT "promotion_settings_source_known" CHECK (
    "key" <> 'promotions_source' OR "value" = 'promotions'
  );

-- ── 3. LA REPRISE NEUTRALISÉE ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reprise_des_promotions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = 'la reprise des promotions est close depuis le lot L12 : les règles d''étage '
           || 'promotion et les remises des sites ne sont plus lues, et la rejouer écraserait '
           || 'des promotions éditées par l''équipe.',
    HINT = 'Les promotions se règlent dans l''écran Promotions du back-office.';
END $$;

-- ── 4. LES RÈGLES D'ÉTAGE PROMOTION ARCHIVÉES ───────────────────────────────
WITH archived AS (
  UPDATE public.price_rules
     -- `price_rules.archived_at` est sans fuseau, écrit en UTC par Prisma.
     SET archived_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
         archived_by = 'system:resserrement-promotions',
         archive_reason = 'reprise dans les promotions, archivée au retrait de l''ancien chemin (L12, 2026-10-31)'
   WHERE stage = 'promotion'
     AND archived_at IS NULL
  RETURNING id, label, archived_at, archive_reason
)
INSERT INTO public.pricing_events (id, subject_type, subject_id, act, actor, occurred_at, reason, summary)
SELECT 'resserrement:archived:' || a.id, 'rule', a.id, 'archived', 'system:resserrement-promotions',
       a.archived_at AT TIME ZONE 'UTC', a.archive_reason,
       'Règle d''étage promotion « ' || a.label || ' », servie depuis la bascule par la promotion '
         || a.id || '.'
  FROM archived a
ON CONFLICT (id) DO NOTHING;
