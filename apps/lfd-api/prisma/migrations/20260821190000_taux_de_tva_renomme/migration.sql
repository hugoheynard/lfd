-- « Régime » → « taux ».
--
-- Le mot venait du modèle, pas du métier : ce qu'un comptable pose, c'est un
-- TAUX. L'écran le disait déjà ; le code et la base le disaient encore à leur
-- façon, et deux vocabulaires pour une même chose finissent toujours par se
-- croiser dans une conversation.
--
-- Renommage PUR : mêmes colonnes, mêmes lignes, mêmes contraintes. Les index et
-- clés étrangères suivent la table automatiquement sous Postgres.
ALTER TABLE "pim"."tva_regime" RENAME TO "tva_rate";
