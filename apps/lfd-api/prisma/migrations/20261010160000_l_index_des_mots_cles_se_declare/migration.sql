-- L'index des mots-clés se déclare, le doublon de l'URL tombe (2026-10-10,
-- documentation/mediatheque/mediatheque.md §11).
--
-- 1. `media_asset_tags_idx` (GIN) existe depuis
--    `20260923120000_les_tags_de_la_mediatheque` ; le schéma Prisma le déclare
--    désormais sous ce même nom. Rien à exécuter pour lui.
-- 2. `media_asset_url_idx` doublait `media_asset_url_key`, l'index UNIQUE que
--    `@unique` crée sur la même colonne : il ne servait aucune lecture et
--    coûtait à chaque dépôt.
--
-- Ne supprime AUCUNE donnée : un index se reconstruit à partir de la table.
-- Retour arrière : CREATE INDEX "media_asset_url_idx" ON "media"."media_asset"("url");
-- Aucun droit accordé.

DROP INDEX IF EXISTS "media"."media_asset_url_idx";
