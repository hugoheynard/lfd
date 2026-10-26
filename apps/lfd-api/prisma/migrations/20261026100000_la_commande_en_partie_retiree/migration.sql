-- LA COMMANDE EN PARTIE RETIRÉE — la valeur d'état (plan E7 reliquat,
-- `documentation/commandes/plan-e7-reliquat-bati.md`, choix 8, lot L5a).
--
-- Retour arrière : une valeur d'énumération ne se retire pas sans recréer le
-- type. La laisser, morte, si le geste est retiré : aucune ligne ne la porte
-- avant que le commerce écrive la remise d'un envoi qui n'est pas le dernier
-- (lot L5b).
--
-- SEULE dans sa migration : une valeur ajoutée à une énumération ne
-- s'emploie pas dans la transaction qui l'ajoute (Prisma exécute chaque
-- `migration.sql` d'un bloc). Aucune contrainte, aucun déclencheur ne nomme
-- le statut d'une commande (relu le 2026-10-26 : `orders_billable_frozen`
-- lit les montants, les CHECK de la réception lisent `handed_over_at` et
-- `received_on`) : rien d'autre à migrer.
--
-- ADDITIVE : aucune ligne existante ne la porte, aucune recopie.

ALTER TYPE "public"."OrderStatus" ADD VALUE IF NOT EXISTS 'partially_handed_over' AFTER 'ready';
