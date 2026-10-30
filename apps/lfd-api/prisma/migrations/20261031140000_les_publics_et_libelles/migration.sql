-- LES PUBLICS ET LES LIBELLÉS — lot L8b de
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md
-- (§ 15.3 « Le modèle de données », § 15.7, § 15.8 ; vitruve n° 3 § 15.13).
--
-- Une promotion vise un ENSEMBLE de publics (table neuve), porte un libellé
-- par audience (colonnes neuves), et la commande fige le libellé de sa remise
-- panier (colonne neuve). Dans CETTE transaction, et dans cet ordre :
--
-- 1. `promotions_audience_known` est SUPPRIMÉE puis RECRÉÉE avec la même liste
--    PLUS `'several'` — le seul geste non additif, dit plutôt que tu : sans
--    lui, la première promotion à plusieurs publics serait refusée en base.
--    Le `migration.sql` de L3 n'est pas touché.
-- 2. `promotion_audience_targets` : une ligne par public visé. Unicité
--    `(promotion_id, kind, company_id) NULLS NOT DISTINCT`, écrite ICI et non
--    dans le schéma Prisma, qui ne sait pas l'exprimer (précédent :
--    `shop_carts_user_company_unique`, `orders.prisma`). Un `@@unique`
--    ordinaire laisserait passer deux fois `(p, pros, NULL)`.
-- 3. Les libellés Particuliers / Pros (`label_individuals_*`, `label_pros_*`),
--    nullables : `label_fr/en/it` restent le libellé COMMUN, sens inchangé.
-- 4. `orders.discount_label` (jsonb NULL) : le libellé de la remise panier
--    figé à la passation, `{fr, en, it}`. Aucune ligne écrite.
-- 5. Le remplissage : une cible par promotion existante, recopiée de
--    `audience_kind` / `audience_company_id`. Après lui, LA TABLE FAIT FOI ;
--    les deux colonnes en sont une projection (`'several'` + `NULL` pour
--    plusieurs publics), écrite par l'adaptateur dans la même transaction.
--    Identifiant composé `promotion_id:kind:company_id`, la règle que les
--    règles de portée suivent déjà ; une cible posée à l'écran prend un ULID.
-- 6. `cibles_des_promotions_reprises()` : la table des cibles suit ce que la
--    reprise écrit dans les deux colonnes (cible de conflit : l'index unique).
-- 7. `bascule_des_promotions()` REMPLACÉE : après la bascule, elle sort sans
--    effet (une promotion reprise puis éditée appartient au staff, un rejeu
--    l'écraserait). Avant (une base revenue à `legacy`), elle rejoue comme en
--    L8, PUIS donne leur cible aux promotions reprises, PUIS contrôle.
--    `controle_des_promotions()` n'est pas modifiée.
--
-- Aucune valeur existante réécrite, aucune colonne supprimée, aucun droit
-- accordé.
--
-- 🔴 IRRÉVERSIBLE dès la première promotion à plusieurs publics : un code
-- d'avant L8b lirait `audience_kind = 'several'` et refuserait TOUTES les
-- promotions (caisse comprise). Retour arrière, AVANT le retour du code :
-- prisma/rollback/20261031140000_les_publics_et_libelles.sql.

SET lock_timeout = '5s';

-- 1. La contrainte, élargie de `'several'`.
ALTER TABLE "public"."promotions" DROP CONSTRAINT "promotions_audience_known";
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_audience_known"
  CHECK ("audience_kind" IN (
    'everyone', 'individuals', 'individuals_guest', 'individuals_registered',
    'pros', 'pros_active', 'pros_pending', 'company', 'company_and_sites',
    'everyone_but_active_pros', 'several'
  ));
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_several_without_company"
  CHECK ("audience_kind" <> 'several' OR "audience_company_id" IS NULL);

-- 2. Les cibles.
CREATE TABLE "public"."promotion_audience_targets" (
  "id"           TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "kind"         TEXT NOT NULL,
  "company_id"   TEXT,

  CONSTRAINT "promotion_audience_targets_pkey" PRIMARY KEY ("id"),
  -- Jamais `several` ici : une cible est UN public.
  CONSTRAINT "promotion_audience_targets_kind_known" CHECK ("kind" IN (
    'everyone', 'individuals', 'individuals_guest', 'individuals_registered',
    'pros', 'pros_active', 'pros_pending', 'company', 'company_and_sites',
    'everyone_but_active_pros'
  )),
  CONSTRAINT "promotion_audience_targets_company"
    CHECK (("kind" IN ('company', 'company_and_sites')) = ("company_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "promotion_audience_targets_unique"
  ON "public"."promotion_audience_targets" ("promotion_id", "kind", "company_id")
  NULLS NOT DISTINCT;
CREATE INDEX "promotion_audience_targets_company_id_idx"
  ON "public"."promotion_audience_targets" ("company_id");

ALTER TABLE "public"."promotion_audience_targets"
  ADD CONSTRAINT "promotion_audience_targets_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Les libellés par audience — l'anglais et l'italien n'existent qu'avec le français.
ALTER TABLE "public"."promotions"
  ADD COLUMN "label_individuals_fr" TEXT,
  ADD COLUMN "label_individuals_en" TEXT,
  ADD COLUMN "label_individuals_it" TEXT,
  ADD COLUMN "label_pros_fr" TEXT,
  ADD COLUMN "label_pros_en" TEXT,
  ADD COLUMN "label_pros_it" TEXT;
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_label_individuals_whole" CHECK (
  ("label_individuals_fr" IS NOT NULL AND btrim("label_individuals_fr") <> '')
  OR ("label_individuals_fr" IS NULL
      AND "label_individuals_en" IS NULL AND "label_individuals_it" IS NULL)
);
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_label_pros_whole" CHECK (
  ("label_pros_fr" IS NOT NULL AND btrim("label_pros_fr") <> '')
  OR ("label_pros_fr" IS NULL AND "label_pros_en" IS NULL AND "label_pros_it" IS NULL)
);

-- 4. Le libellé figé de la remise panier.
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "discount_label" JSONB;

-- 5. Le remplissage : chaque promotion existante a un public simple.
INSERT INTO "public"."promotion_audience_targets" ("id", "promotion_id", "kind", "company_id")
SELECT p.id || ':' || p.audience_kind || ':' || coalesce(p.audience_company_id, ''),
       p.id, p.audience_kind, p.audience_company_id
  FROM "public"."promotions" p
 WHERE p.audience_kind <> 'several'
ON CONFLICT ("promotion_id", "kind", "company_id") DO NOTHING;

-- 6. Les cibles des promotions reprises. La reprise (L4) n'écrit que des
--    publics simples, dans les deux colonnes : la table des cibles, qui fait
--    foi, les suit — une cible retirée si la projection a changé, une cible
--    posée si la promotion n'en a pas. N'écrit rien pour une promotion
--    `several` (aucune reprise n'en pose), ni pour une saisie.
CREATE OR REPLACE FUNCTION public.cibles_des_promotions_reprises()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.promotion_audience_targets t
   USING public.promotions p
   WHERE t.promotion_id = p.id AND p.legacy_source IS NOT NULL
     AND p.audience_kind <> 'several'
     AND (t.kind, coalesce(t.company_id, '')) <> (p.audience_kind, coalesce(p.audience_company_id, ''));
  INSERT INTO public.promotion_audience_targets (id, promotion_id, kind, company_id)
  SELECT p.id || ':' || p.audience_kind || ':' || coalesce(p.audience_company_id, ''),
         p.id, p.audience_kind, p.audience_company_id
    FROM public.promotions p
   WHERE p.audience_kind <> 'several'
     AND NOT EXISTS (SELECT 1 FROM public.promotion_audience_targets t WHERE t.promotion_id = p.id)
  ON CONFLICT (promotion_id, kind, company_id) DO NOTHING;
END
$$;

-- 7. La bascule ne rejoue plus rien une fois faite.
CREATE OR REPLACE FUNCTION public.bascule_des_promotions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promotion_settings
              WHERE key = 'promotions_source' AND value = 'promotions') THEN
    RAISE NOTICE 'bascule des promotions déjà faite : rien n''est rejoué, aucune promotion n''est '
                 'réécrite (une promotion reprise puis éditée appartient au staff).';
    RETURN;
  END IF;
  PERFORM public.reprise_des_promotions();
  PERFORM public.cibles_des_promotions_reprises();
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
