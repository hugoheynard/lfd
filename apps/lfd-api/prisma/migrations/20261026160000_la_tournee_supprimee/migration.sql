-- LA TOURNÉE SUPPRIMÉE — `delivery.delivery_round.removed_at`
--
-- Décision de Hugo, 2026-10-26 : « Supprimer la tournée » dans Tour manager —
-- une tournée créée par erreur. Ses arrêts retournent « à répartir » le jour
-- même (leurs lignes prennent `removed_at`, comme un arrêt retiré à la main),
-- et la tournée prend `removed_at` : jamais de DELETE, la ligne reste, les
-- lectures du jour l'ignorent. Doc : `documentation/livraisons/tournees/`.
--
-- Écrivain : la tournée seule (`DeliveryRound.removeRound`), au dépôt : une
-- tournée partie ne se supprime pas (CHECK ci-dessous). Les trois
-- déclencheurs `day_change` de `delivery_round` couvrent déjà la colonne.
--
-- Strictement ADDITIVE : une colonne nullable, aucun remplissage. L'ancien
-- binaire ne la connaît pas, ne l'écrit ni ne l'efface (`updateMany` sur ses
-- seules colonnes) ; il relirait une tournée supprimée comme vide.
--
-- Retour arrière : `ALTER TABLE "delivery"."delivery_round" DROP CONSTRAINT
-- "delivery_round_removed_never_departed", DROP COLUMN "removed_at";` — les
-- tournées supprimées entre-temps reparaissent, vides.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "removed_at" TIMESTAMP(3);

-- Une tournée supprimée n'est jamais partie.
ALTER TABLE "delivery"."delivery_round"
  ADD CONSTRAINT "delivery_round_removed_never_departed"
  CHECK ("removed_at" IS NULL OR "departed_at" IS NULL);
