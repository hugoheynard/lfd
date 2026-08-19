-- La carte de santé OPS devient une ressource du mur staff.
--
-- `ADD VALUE IF NOT EXISTS` : cette migration doit pouvoir se rejouer sur une
-- base où la valeur existe déjà (base de dev poussée à la main avant que la
-- migration n'existe) sans faire échouer tout le déploiement.
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'ops';
