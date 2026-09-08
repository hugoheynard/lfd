-- **Figer le barème de zone qui a produit les frais de livraison.**
--
-- La remise de retrait et la surtaxe de retard figeaient déjà l'ajustement qui
-- les a produites ; les frais de zone étaient le dernier terme du panier à
-- n'avoir que son montant. Or `delivery_zones.fee_value` est **mutable** : une
-- facture émise dans six mois pouvait chiffrer « Livraison 24,00 € » sans jamais
-- pouvoir dire « Val d'Isère, 20 € forfaitaires », ni prouver que ce forfait
-- était bien celui du jour de la commande.
--
-- **Additive et réversible.** Colonne nullable, aucun défaut, aucune reprise :
-- `NULL` veut dire « retrait, donc aucun frais » OU « commande antérieure à
-- cette migration ». Les deux se distinguent par `delivery_fee_cents`, nul dans
-- le premier cas — l'information n'est donc pas perdue, elle est déduite.
--
-- Aucune reprise n'est faite sur l'historique, et c'est délibéré : recopier le
-- barème ACTUEL d'une zone sur des commandes passées écrirait un fait qui n'a
-- peut-être jamais eu lieu. C'est exactement ce que cette colonne existe pour
-- empêcher.
ALTER TABLE "public"."orders"
  ADD COLUMN "delivery_fee_adjustment" JSONB;
