-- La première entrée réussie d'un client (page « Accès clients »).
-- Additive et nullable : aucune reprise. Les comptes déjà entrés gardent NULL,
-- qui se lit « date inconnue » — une date fabriquée ne se distinguerait plus
-- d'une vraie.
ALTER TABLE "public"."users" ADD COLUMN "first_login_at" TIMESTAMPTZ(3);
