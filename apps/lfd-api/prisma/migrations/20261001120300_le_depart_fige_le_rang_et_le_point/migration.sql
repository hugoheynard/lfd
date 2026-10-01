-- LE DÉPART FIGE LE RANG ET LE POINT — `delivery.delivery_stop_execution`
--
-- Plan `documentation/livraisons/plan-ma-tournee.md`, MT-D5 v2 : l'instantané
-- du départ ne portait ni ordre ni point GPS.
--
-- - `departure_rank` — le rang de passage figé au départ (1..n) : `closeStop`
--   resserrera `position` au lot 6 (L6-C11), la numérotation du livreur ne
--   doit pas bouger pendant la tournée ;
-- - `gps_lat`, `gps_lng` — le point du carnet figé au départ : la navigation
--   suit le point promis, pas le carnet corrigé en route.
--
-- Strictement ADDITIVE, trois colonnes nullables, aucun remplissage : un arrêt
-- parti AVANT cette migration n'a ni rang ni point, et la vue du livreur
-- retombe sur `position` et sur le point du carnet en le disant (« ordre et
-- position non figés au départ »). Inventer un rang pour l'histoire serait
-- affirmer ce que le départ n'a pas promis.
--
-- Les binaires en place n'écrivent pas ces colonnes : une tournée partie par
-- l'ancien binaire pendant le déploiement est dans le cas ci-dessus.
--
-- Retour arrière : `ALTER TABLE "delivery"."delivery_stop_execution" DROP COLUMN
-- "departure_rank", DROP COLUMN "gps_lat", DROP COLUMN "gps_lng";`

ALTER TABLE "delivery"."delivery_stop_execution" ADD COLUMN IF NOT EXISTS "departure_rank" INTEGER;
ALTER TABLE "delivery"."delivery_stop_execution" ADD COLUMN IF NOT EXISTS "gps_lat" DOUBLE PRECISION;
ALTER TABLE "delivery"."delivery_stop_execution" ADD COLUMN IF NOT EXISTS "gps_lng" DOUBLE PRECISION;

-- Un rang est 1..n, et un point a ses deux coordonnées ou aucune.
ALTER TABLE "delivery"."delivery_stop_execution"
  ADD CONSTRAINT "delivery_stop_execution_departure_rank_positive"
  CHECK ("departure_rank" IS NULL OR "departure_rank" >= 1);
ALTER TABLE "delivery"."delivery_stop_execution"
  ADD CONSTRAINT "delivery_stop_execution_gps_both_or_none"
  CHECK (("gps_lat" IS NULL) = ("gps_lng" IS NULL));
