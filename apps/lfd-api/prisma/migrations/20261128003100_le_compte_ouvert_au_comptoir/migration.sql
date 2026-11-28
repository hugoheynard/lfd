-- Le compte ouvert au comptoir : un statut de société de plus
-- (documentation/comptes-client/plan-comptes-du-comptoir.md, § 3.1, lot K1).
--
-- ADDITIVE : une valeur d'enum, aucune ligne ne la porte encore. Une société
-- `counter_opened` n'est ni au compte côté boutique, ni payeur du mois, tant
-- que le commerce ne l'a pas convertie (`pending` ou `active`).
ALTER TYPE "public"."CompanyStatus" ADD VALUE IF NOT EXISTS 'counter_opened';
