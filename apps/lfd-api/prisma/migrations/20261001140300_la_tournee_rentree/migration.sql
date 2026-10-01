-- LA TOURNÉE RENTRÉE — `delivery.delivery_round.returned_*`
--
-- Plan `documentation/livraisons/parcours-du-livreur.md`, « Tranché par Hugo
-- le 2026-10-01 », lot PL2 : « Tournée terminée » signifie que les bacs vides
-- sont rentrés, et ferme la mesure du temps de tournée (départ → retour). Aucun
-- scan, aucun état de bac : rien ne s'abîme ni ne se perd pour l'instant.
--
-- - `returned_at` — l'instant du retour (`Clock`), nul tant qu'elle roule ;
-- - `returned_by`, `returned_by_name` — la fiche staff qui l'a déclarée (le
--   livreur, ou l'admin depuis Tournées), son nom FIGÉ au geste ; opaque, sans
--   clé étrangère, comme `driver_staff_id`.
--
-- Écrivain : la tournée seule (`DeliveryRound.returnToDepot`). Les trois
-- déclencheurs `day_change` de `delivery_round` couvrent déjà ces colonnes :
-- l'écran Tournées voit une tournée rentrer.
--
-- Strictement ADDITIVE : trois colonnes nullables, aucun remplissage — une
-- tournée partie avant cette migration n'est pas « rentrée », et le dire
-- serait inventer un retour que personne n'a déclaré. L'ancien binaire, qui ne
-- les connaît pas, ne les écrit ni ne les efface (`updateMany` sur ses seules
-- colonnes).
--
-- Retour arrière : `ALTER TABLE "delivery"."delivery_round" DROP CONSTRAINT
-- "delivery_round_returned_after_departure", DROP CONSTRAINT
-- "delivery_round_returned_has_author", DROP COLUMN "returned_at", DROP COLUMN
-- "returned_by", DROP COLUMN "returned_by_name";` — perd les retours déclarés
-- entre-temps.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMP(3);
ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "returned_by" TEXT;
ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "returned_by_name" TEXT;

-- On ne rentre que d'une tournée partie ; un retour a toujours son auteur.
ALTER TABLE "delivery"."delivery_round"
  ADD CONSTRAINT "delivery_round_returned_after_departure"
  CHECK ("returned_at" IS NULL OR "departed_at" IS NOT NULL);
ALTER TABLE "delivery"."delivery_round"
  ADD CONSTRAINT "delivery_round_returned_has_author"
  CHECK (("returned_at" IS NULL) = ("returned_by" IS NULL)
     AND ("returned_at" IS NULL) = ("returned_by_name" IS NULL));
