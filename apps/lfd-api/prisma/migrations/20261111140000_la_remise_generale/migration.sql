-- La remise générale d'une mercuriale — « tout à −30 %, sauf le chocolat »
-- (documentation/pricing/mercuriales/plan-remise-generale.md, § 3).
--
-- ADDITIVE, aucune ligne réécrite : `NULL` partout = le comportement d'avant.
--
-- 1. `company_mercuriales.general_discount` : la remise du document.
-- 2. `company_mercuriale_amendments.general_discount` +
--    `general_discount_set` : un avenant « n'en dit rien » (false, NULL),
--    « l'arrête » (true, NULL) ou « la remplace » (true, valeur). Un CHECK
--    refuse une valeur sans le drapeau.
-- 3. `mercuriale_drafts.general_discount` : la remise saisie dans le brouillon.
-- 4. Un CHECK de forme par colonne : `mode` dans `all_except` / `only`,
--    `baseBp` entier de 1 à 9 999 ou `null`, `rules` un tableau. Le domaine
--    revérifie le reste (cohérence mode/taux, doublons) à la lecture.
--
-- Retour arrière : `prisma/rollback/20261111140000_la_remise_generale.sql`.

-- CASE plutôt qu'une chaîne de AND : Postgres ne promet pas l'ordre
-- d'évaluation, et le transtypage de `baseBp` ne doit tourner que sur un nombre.
CREATE FUNCTION public.general_discount_shape_ok(discount jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN discount IS NULL THEN true
    WHEN jsonb_typeof(discount) <> 'object' THEN false
    WHEN coalesce(discount->>'mode', '') NOT IN ('all_except', 'only') THEN false
    WHEN jsonb_typeof(discount->'rules') IS DISTINCT FROM 'array' THEN false
    WHEN jsonb_typeof(discount->'baseBp') = 'null' THEN true
    WHEN jsonb_typeof(discount->'baseBp') IS DISTINCT FROM 'number' THEN false
    ELSE (discount->>'baseBp')::numeric BETWEEN 1 AND 9999
      AND (discount->>'baseBp')::numeric = trunc((discount->>'baseBp')::numeric)
  END
$$;

ALTER TABLE public.company_mercuriales
  ADD COLUMN general_discount JSONB;

ALTER TABLE public.company_mercuriales
  ADD CONSTRAINT company_mercuriales_general_discount_shape CHECK (
    public.general_discount_shape_ok(general_discount)
  );

ALTER TABLE public.company_mercuriale_amendments
  ADD COLUMN general_discount JSONB,
  ADD COLUMN general_discount_set BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.company_mercuriale_amendments
  ADD CONSTRAINT company_mercuriale_amendments_general_discount_set CHECK (
    general_discount_set OR general_discount IS NULL
  ),
  ADD CONSTRAINT company_mercuriale_amendments_general_discount_shape CHECK (
    public.general_discount_shape_ok(general_discount)
  );

ALTER TABLE public.mercuriale_drafts
  ADD COLUMN general_discount JSONB;

ALTER TABLE public.mercuriale_drafts
  ADD CONSTRAINT mercuriale_drafts_general_discount_shape CHECK (
    public.general_discount_shape_ok(general_discount)
  );
