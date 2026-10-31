-- Les remises acquises — plan
-- documentation/promotions/plan-remises-acquises.md, § 10.3.
--
-- « Une modification ne change jamais un prix convenu en silence. » La
-- révision d'une commande REJOUE ses remises de panier, elle ne les rejuge
-- plus : ce qui les conditionnait se fige donc sur la remise, à la passation,
-- pour ne jamais relire une promotion archivée depuis.
--
-- Ce qu'elle fait — ADDITIVE, aucune ligne écrite :
--
-- 1. Sept colonnes nullables sur `order_discounts` :
--      cumulative                  la case « Cumulable » de la promotion ;
--      min_quantity                son seuil `min_quantity`, NULL sans seuil ;
--      fulfillment_pickup          `none` · `all` · `listed`, la forme de la
--      fulfillment_delivery        promotion (§ 2.14 de promotions.md) ;
--      fulfillment_pickup_points   les points nommés (`listed`), sans FK ;
--      fulfillment_delivery_zones  les zones nommées (`listed`), sans FK ;
--      frozen_terms_origin         `placed` (figé à la passation) ·
--                                  `backfilled` (déduit de la promotion par
--                                  le script de reprise) · NULL (inconnu).
--    Les listes sont des identifiants OPAQUES : la remise garde la trace
--    d'un point ou d'une zone supprimés depuis, comme son libellé.
-- 2. Les CHECK : origine connue ; termes présents ensemble ou absents
--    ensemble ; modes connus ; seuil positif.
--
-- Les remises existantes restent à NULL (« inconnu ») jusqu'au script
-- script `prisma/backfill-order-discounts.ts` (à blanc par défaut), qui les
-- déduit de leur promotion et les marque `backfilled`.
--
-- Retour arrière : `prisma/rollback/20261031210000_les_remises_acquises.sql`.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_discounts"
  ADD COLUMN "cumulative"                 BOOLEAN,
  ADD COLUMN "min_quantity"               INTEGER,
  ADD COLUMN "fulfillment_pickup"         TEXT,
  ADD COLUMN "fulfillment_delivery"       TEXT,
  ADD COLUMN "fulfillment_pickup_points"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "fulfillment_delivery_zones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "frozen_terms_origin"        TEXT;

ALTER TABLE "public"."order_discounts"
  ADD CONSTRAINT "order_discounts_terms_origin_known" CHECK (
    "frozen_terms_origin" IS NULL OR "frozen_terms_origin" IN ('placed', 'backfilled')
  ),
  -- Figés ensemble ou pas du tout : une remise à moitié figée se rejouerait
  -- sur des conditions inventées.
  ADD CONSTRAINT "order_discounts_terms_together" CHECK (
    ("frozen_terms_origin" IS NULL) = ("cumulative" IS NULL)
    AND ("frozen_terms_origin" IS NULL) = ("fulfillment_pickup" IS NULL)
    AND ("frozen_terms_origin" IS NULL) = ("fulfillment_delivery" IS NULL)
    AND ("frozen_terms_origin" IS NOT NULL OR "min_quantity" IS NULL)
  ),
  ADD CONSTRAINT "order_discounts_terms_modes_known" CHECK (
    ("fulfillment_pickup" IS NULL OR "fulfillment_pickup" IN ('none', 'all', 'listed'))
    AND ("fulfillment_delivery" IS NULL OR "fulfillment_delivery" IN ('none', 'all', 'listed'))
  ),
  ADD CONSTRAINT "order_discounts_min_quantity_positive" CHECK (
    "min_quantity" IS NULL OR "min_quantity" >= 1
  );
