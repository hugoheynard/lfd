-- LE LIVREUR D'UNE TOURNÉE — `delivery.delivery_round.driver_staff_id`
--
-- Plan `documentation/livraisons/plan-ma-tournee.md`, MT-D2 v2 : qui compose
-- affecte un livreur ; le livreur ne voit et ne fait partir QUE les tournées
-- où il est affecté (MT-D3, le mur dans la requête).
--
-- Strictement ADDITIVE : une colonne nullable et un index. Les binaires en
-- place ne la lisent pas ; une tournée sans livreur reste ce qu'elle était, et
-- la route de départ du chargeur ne l'exige pas (MT-Q5 tranchée).
--
-- 🔴 SANS clé étrangère, comme `granted_by_staff_id` : la tournée vit dans
-- `delivery`, l'annuaire dans `public`, et aucune clé ne traverse un schéma
-- (`architecture-isolation-livraison.md` §3). Une fiche qui perd le droit de
-- conduire reste affectée : l'écran Tournées le dit, le guard la refuse.
--
-- Le déclencheur de journée de la table (`delivery_round_day_change_update`,
-- AFTER UPDATE sans liste de colonnes) voit déjà toute affectation : rien à
-- brancher.
--
-- Retour arrière : `DROP INDEX "delivery"."delivery_round_driver_staff_id_service_day_idx";
-- ALTER TABLE "delivery"."delivery_round" DROP COLUMN "driver_staff_id";` — il
-- ne perd que les affectations.

ALTER TABLE "delivery"."delivery_round" ADD COLUMN IF NOT EXISTS "driver_staff_id" TEXT;

-- Le mur du livreur lit ses tournées d'un jour : `(livreur, jour)`.
CREATE INDEX IF NOT EXISTS "delivery_round_driver_staff_id_service_day_idx"
    ON "delivery"."delivery_round"("driver_staff_id", "service_day");
