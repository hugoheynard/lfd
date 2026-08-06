-- Préférences de navigation/affichage par personne (bag JSON extensible).
-- Aujourd'hui : `catalogueView`. NULL = aucun choix explicite (défaut front).
ALTER TABLE "users" ADD COLUMN "nav_prefs" JSONB;
