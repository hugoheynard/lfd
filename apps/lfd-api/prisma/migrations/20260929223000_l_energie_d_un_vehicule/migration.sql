-- L'ÉNERGIE D'UN VÉHICULE — `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 2 bis, L2b-C6.
--
-- Une SECONDE migration, et non une retouche de
-- `20260929220000_le_chargement_d_un_vehicule` : celle-ci était déjà appliquée
-- quand Hugo a ajouté l'énergie au lot.
--
-- Purement ADDITIVE : une colonne texte NULLABLE — les véhicules existants
-- restent « non renseignée ». Texte + CHECK plutôt qu'un enum Postgres, comme
-- le reste du schéma `production` : une valeur s'ajoute en réécrivant le CHECK.
--
-- Retour arrière : `ALTER TABLE "production"."delivery_vehicle" DROP CONSTRAINT
-- "delivery_vehicle_energy_known", DROP COLUMN "energy"` — on y perd les
-- énergies saisies.

ALTER TABLE "production"."delivery_vehicle" ADD COLUMN "energy" TEXT;

ALTER TABLE "production"."delivery_vehicle"
    ADD CONSTRAINT "delivery_vehicle_energy_known" CHECK (
        "energy" IS NULL OR "energy" IN ('electric', 'hybrid', 'diesel', 'petrol', 'gas')
    );
