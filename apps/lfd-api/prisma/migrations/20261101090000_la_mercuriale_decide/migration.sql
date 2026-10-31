-- La mercuriale décide si son client profite des promotions —
-- documentation/promotions/plan-la-mercuriale-decide.md, § 7 et § 8.
--
-- La politique de promotions (aucune `none`, toutes `all`, au choix
-- `selected` + liste) passe par le mécanisme qui date déjà la mercuriale
-- (Hugo, 2026-10-31) : le document porte sa politique de départ, un avenant
-- peut en porter une nouvelle à partir de sa date d'effet, le brouillon porte
-- celle qu'on posera. Rien ne se modifie sur place.
--
-- Ce qu'elle fait — ADDITIVE, aucune ligne réécrite :
--
-- 1. `company_mercuriales` : `promotion_mode` (défaut `none`) et
--    `promotion_ids` ; une mercuriale existante vaut « Aucune » jusqu'à la
--    reprise.
-- 2. `company_mercuriale_amendments` : les mêmes, `promotion_mode` NULLABLE
--    (`NULL` = l'avenant ne change pas la politique).
-- 3. `mercuriale_drafts` : les mêmes, défaut `none`.
-- 4. Un CHECK par table : mode connu, liste remplie en `selected` seulement.
--
-- Les identifiants de promotions sont OPAQUES (pas de clé étrangère sur un
-- tableau) : une promotion archivée reste dans une liste, sans effet.
--
-- `promotions.stacks_over_mercuriale` n'est pas touchée : l'API cesse de la
-- lire et de l'écrire, la colonne reste (CLAUDE.md § 0), et le script
-- `prisma/backfill-mercuriale-promotion-policies.ts` la lit.
--
-- 🔴 Tant que la reprise n'a pas tourné, une promotion cochée « aussi pour
-- les tarifs négociés » cesse d'agir chez ces clients. La reprise se joue
-- juste après le déploiement.
--
-- Retour arrière : `prisma/rollback/20261101090000_la_mercuriale_decide.sql`.

ALTER TABLE public.company_mercuriales
  ADD COLUMN promotion_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN promotion_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.company_mercuriales
  ADD CONSTRAINT company_mercuriales_promotion_policy_shape CHECK (
    promotion_mode IN ('none', 'all', 'selected')
    AND (promotion_mode = 'selected') = (cardinality(promotion_ids) > 0)
  );

ALTER TABLE public.company_mercuriale_amendments
  ADD COLUMN promotion_mode TEXT,
  ADD COLUMN promotion_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.company_mercuriale_amendments
  ADD CONSTRAINT company_mercuriale_amendments_promotion_policy_shape CHECK (
    (promotion_mode IS NULL AND cardinality(promotion_ids) = 0)
    OR (
      promotion_mode IN ('none', 'all', 'selected')
      AND (promotion_mode = 'selected') = (cardinality(promotion_ids) > 0)
    )
  );

ALTER TABLE public.mercuriale_drafts
  ADD COLUMN promotion_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN promotion_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.mercuriale_drafts
  ADD CONSTRAINT mercuriale_drafts_promotion_policy_shape CHECK (
    promotion_mode IN ('none', 'all', 'selected')
    AND (promotion_mode = 'selected') = (cardinality(promotion_ids) > 0)
  );
