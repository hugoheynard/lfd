-- Fin de la configuration des pièces d'activation.
--
-- Le parcours d'ouverture est arrêté : ce qui bloque une activation est écrit
-- dans le code (`activationGate`), avec ses tests et sa revue. Une case cochée
-- depuis un écran ne redéfinit plus « client » pour toute la plateforme.
--
-- Rien à sauvegarder : la table ne portait que les quatre modes, et leurs
-- valeurs de production étaient les défauts. La perte est nulle et le retour en
-- arrière est le fichier de migration précédent.
DROP TABLE IF EXISTS "public"."b2b_platform_settings";

DROP TYPE IF EXISTS "public"."PieceMode";
