-- La fiscalité devient une ressource staff à part entière : les régimes de TVA
-- quittent `catalog`, dont l'écriture est réservée à l'admin, pour une
-- ressource que la comptabilité peut écrire.
--
-- Ajout PUR : aucune ligne existante ne porte cette valeur, et les dérogations
-- déjà posées sur `catalog` restent valides — elles ne parlaient pas de TVA.
ALTER TYPE "public"."StaffResource" ADD VALUE 'tax' AFTER 'catalog';
