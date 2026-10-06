-- LA TOURNÉE GARDE SON HORAIRE PRÉVU — `delivery.delivery_round.planned_*`
--
-- Décision de Hugo (2026-10-06) : une tournée enregistrée garde le départ, le
-- retour et la distance que le calcul routier lui a prévus quand on a
-- « Appliqué » la proposition, pour que la feuille de tournée les imprime.
--
-- - `planned_departure_at`, `planned_return_at` — deux INSTANTS ;
-- - `planned_meters` — la distance prévue, en mètres entiers.
--
-- Écrivain : la tournée seule (`DeliveryRound.planTiming`, à l'application
-- d'une proposition). Elle les EFFACE dès que ses arrêts changent à la main :
-- un chiffre périmé est pire qu'aucun. Les trois sont nuls ensemble, ou posés
-- ensemble.
--
-- Strictement ADDITIVE : trois colonnes nullables, aucun remplissage — une
-- tournée composée avant cette migration n'a pas d'horaire prévu, et lui en
-- inventer un serait mentir. L'ancien binaire ne les écrit ni ne les efface.
--
-- Retour arrière : `ALTER TABLE "delivery"."delivery_round" DROP CONSTRAINT
-- "delivery_round_planned_all_or_none", DROP CONSTRAINT
-- "delivery_round_planned_coherent", DROP COLUMN "planned_departure_at", DROP
-- COLUMN "planned_return_at", DROP COLUMN "planned_meters";`.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "planned_departure_at" TIMESTAMP(3);
ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "planned_return_at" TIMESTAMP(3);
ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "planned_meters" INTEGER;

-- Tous nuls, ou tous posés : un départ sans retour ne se lit pas.
ALTER TABLE "delivery"."delivery_round"
  ADD CONSTRAINT "delivery_round_planned_all_or_none"
  CHECK (
    ("planned_departure_at" IS NULL AND "planned_return_at" IS NULL AND "planned_meters" IS NULL)
    OR ("planned_departure_at" IS NOT NULL AND "planned_return_at" IS NOT NULL AND "planned_meters" IS NOT NULL)
  );
-- On ne rentre pas avant d'être parti ; une distance n'est pas négative.
ALTER TABLE "delivery"."delivery_round"
  ADD CONSTRAINT "delivery_round_planned_coherent"
  CHECK (
    "planned_departure_at" IS NULL
    OR ("planned_return_at" >= "planned_departure_at" AND "planned_meters" >= 0)
  );
