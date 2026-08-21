-- Le journal d'activité devient une surface staff lisible, donc une ressource :
-- il traverse tous les modules, et n'appartient à aucun.
--
-- Ajout PUR, comme `tax` : aucune ligne existante ne porte cette valeur.
ALTER TYPE "public"."StaffResource" ADD VALUE 'activity' AFTER 'staff';
