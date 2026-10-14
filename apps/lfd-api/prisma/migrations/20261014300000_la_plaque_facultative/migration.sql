-- LA PLAQUE D'UN VÉHICULE DEVIENT FACULTATIVE
--
-- Hugo, 2026-10-14 : « je devrais pouvoir enregistrer un véhicule sans avoir
-- la plaque, seul le nom du véhicule devrait être obligatoire ». Ce qui manque
-- se dit en avertissement sur la fiche (`vehicleGaps`), pas en refus.
--
-- ADDITIF : on RELÂCHE une contrainte, aucune donnée n'est réécrite. L'index
-- unique partiel `delivery_vehicle_active_plate_key` (plaque, véhicules en
-- service) reste tel quel : Postgres tient deux `NULL` pour distincts, donc
-- l'unicité reste vraie pour les plaques renseignées et plusieurs véhicules
-- sans plaque coexistent.
--
-- Retour arrière : `SET NOT NULL` seulement après avoir renseigné la plaque
-- de chaque véhicule qui n'en a pas (sinon la commande échoue).

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_vehicle" ALTER COLUMN "plate" DROP NOT NULL;
