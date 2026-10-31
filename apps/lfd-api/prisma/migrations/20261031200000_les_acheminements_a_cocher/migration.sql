-- Les acheminements à cocher — plan
-- documentation/promotions/plan-acheminements-a-cocher.md (§ 4, § 8, § 9).
--
-- Une promotion « en remise au panier » coche le retrait (aucun, tous les
-- points, ou une sélection) ET la livraison (aucune, toutes les zones, ou une
-- sélection) : un point et une zone tiennent dans UNE promotion. « Dans le
-- prix affiché » (l'ancien `any`) reste le point ligne.
--
-- Ce qu'elle fait, dans la transaction de la migration :
--
-- 1. Deux colonnes de mode, `fulfillment_pickup` et `fulfillment_delivery`
--    (`none` · `all` · `listed`, `NULL` au point ligne).
-- 2. Deux tables de liaison, `promotion_pickup_points` (clé étrangère vers
--    `pickup_addresses`, RESTRICT : un site s'archive, il ne se supprime pas)
--    et `promotion_delivery_zones` (vers `delivery_zones`, RESTRICT : la
--    suppression d'une zone qu'une promotion nomme, archivée comprise, est
--    refusée avant, par l'application, la zone verrouillée).
-- 3. GARDE-FOU : une promotion « retrait à un point » dont le point n'existe
--    pas arrête la migration en le nommant — `fulfillment_pickup_id` n'avait
--    pas de clé étrangère.
-- 4. La table de correspondance du § 4, une promotion à la fois :
--      any                  → point ligne, modes NULL
--      pickup               → retrait `all`, livraison `none`
--      pickup_point + id    → retrait `listed` [id], livraison `none`
--      delivery             → retrait `none`, livraison `all`
-- 5. `fulfillment_kind` devient NULLABLE ; avec `fulfillment_pickup_id`, il
--    n'est plus ni lu ni écrit (colonnes mortes, gardées : CLAUDE.md § 0). Le
--    CHECK `promotions_point_follows_fulfillment`, qui liait le point
--    d'application à `fulfillment_kind`, est RETIRÉ : une promotion révisée
--    ne réécrit plus cette colonne, et le CHECK la refuserait. Les deux
--    autres CHECK de ces colonnes restent (ils admettent `NULL`).
-- 6. Les CHECK de la forme neuve : modes connus, modes ⇔ point panier, au
--    moins un mode coché.
--
-- Les COMMANDES ne sont pas touchées : elles figent leur remise, son libellé
-- et sa promotion (`order_discounts`). Le journal garde ses faits passés.
--
-- Retour arrière : `prisma/rollback/20261031200000_les_acheminements_a_cocher.sql`
-- — PAS gratuit dès le déploiement (§ 9) : il recalcule les colonnes
-- anciennes depuis la forme neuve, et archive ce qu'elles ne savent pas dire.

SET lock_timeout = '5s';

-- ── 1. LES MODES ────────────────────────────────────────────────────────────
ALTER TABLE "public"."promotions"
  ADD COLUMN "fulfillment_pickup"   TEXT,
  ADD COLUMN "fulfillment_delivery" TEXT;

-- ── 2. LES LIAISONS ─────────────────────────────────────────────────────────
CREATE TABLE "public"."promotion_pickup_points" (
  "promotion_id" TEXT NOT NULL,
  "pickup_id"    TEXT NOT NULL,

  CONSTRAINT "promotion_pickup_points_pkey" PRIMARY KEY ("promotion_id", "pickup_id")
);

CREATE INDEX "promotion_pickup_points_pickup_id_idx"
  ON "public"."promotion_pickup_points"("pickup_id");

ALTER TABLE "public"."promotion_pickup_points"
  ADD CONSTRAINT "promotion_pickup_points_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."promotion_pickup_points"
  ADD CONSTRAINT "promotion_pickup_points_pickup_id_fkey"
  FOREIGN KEY ("pickup_id") REFERENCES "public"."pickup_addresses"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."promotion_delivery_zones" (
  "promotion_id" TEXT NOT NULL,
  "zone_id"      TEXT NOT NULL,

  CONSTRAINT "promotion_delivery_zones_pkey" PRIMARY KEY ("promotion_id", "zone_id")
);

CREATE INDEX "promotion_delivery_zones_zone_id_idx"
  ON "public"."promotion_delivery_zones"("zone_id");

ALTER TABLE "public"."promotion_delivery_zones"
  ADD CONSTRAINT "promotion_delivery_zones_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."promotion_delivery_zones"
  ADD CONSTRAINT "promotion_delivery_zones_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. LE GARDE-FOU ─────────────────────────────────────────────────────────
DO $$
DECLARE
  orphans text;
BEGIN
  SELECT string_agg(p.id || ' → ' || p.fulfillment_pickup_id, ', ' ORDER BY p.id)
    INTO orphans
    FROM public.promotions p
   WHERE p.fulfillment_kind = 'pickup_point'
     AND NOT EXISTS (SELECT 1 FROM public.pickup_addresses s WHERE s.id = p.fulfillment_pickup_id);
  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'acheminements à cocher arrêtés, rien n''a été écrit : des promotions visent un '
             || 'point de retrait qui n''existe pas — ' || orphans,
      HINT = 'Archiver ces promotions (ou les reposer sur un point existant) depuis l''écran '
          || 'Promotions, puis redéployer.';
  END IF;
END $$;

-- ── 4. LA CORRESPONDANCE ────────────────────────────────────────────────────
UPDATE "public"."promotions"
   SET "fulfillment_pickup" = CASE "fulfillment_kind"
         WHEN 'pickup' THEN 'all'
         WHEN 'pickup_point' THEN 'listed'
         WHEN 'delivery' THEN 'none'
       END,
       "fulfillment_delivery" = CASE "fulfillment_kind"
         WHEN 'pickup' THEN 'none'
         WHEN 'pickup_point' THEN 'none'
         WHEN 'delivery' THEN 'all'
       END;

INSERT INTO "public"."promotion_pickup_points" ("promotion_id", "pickup_id")
SELECT p."id", p."fulfillment_pickup_id"
  FROM "public"."promotions" p
 WHERE p."fulfillment_kind" = 'pickup_point';

-- ── 5. LES COLONNES ANCIENNES ───────────────────────────────────────────────
ALTER TABLE "public"."promotions"
  ALTER COLUMN "fulfillment_kind" DROP NOT NULL;

ALTER TABLE "public"."promotions"
  DROP CONSTRAINT "promotions_point_follows_fulfillment";

-- ── 6. LA FORME NEUVE ───────────────────────────────────────────────────────
ALTER TABLE "public"."promotions"
  ADD CONSTRAINT "promotions_fulfillment_modes_known" CHECK (
    ("fulfillment_pickup" IS NULL OR "fulfillment_pickup" IN ('none', 'all', 'listed'))
    AND ("fulfillment_delivery" IS NULL OR "fulfillment_delivery" IN ('none', 'all', 'listed'))
  ),
  -- Au panier, les deux modes sont dits ; « dans le prix affiché », aucun.
  ADD CONSTRAINT "promotions_point_follows_modes" CHECK (
    ("application_point" = 'basket') = ("fulfillment_pickup" IS NOT NULL)
    AND ("application_point" = 'basket') = ("fulfillment_delivery" IS NOT NULL)
  ),
  ADD CONSTRAINT "promotions_basket_reaches_something" CHECK (
    "fulfillment_pickup" IS DISTINCT FROM 'none' OR "fulfillment_delivery" IS DISTINCT FROM 'none'
  );
