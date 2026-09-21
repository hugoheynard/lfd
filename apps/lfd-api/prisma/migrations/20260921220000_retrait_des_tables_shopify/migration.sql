-- Le canal Shopify quitte le schéma — l'app a été DÉSINSTALLÉE le 2026-09-21
-- (R1 du plan `documentation/pim/plan-un-seul-canal-deux-prix.md`). Le code de
-- l'adaptateur était déjà parti ; il ne restait que les tables, qu'aucune ligne
-- de `src/` ne lisait plus.
--
-- ## 🔴 Ce que cette migration DÉTRUIT, et qui ne revient pas
--
-- Quatre tables et leur contenu :
--
-- - `pim.shopify_settings` — le domaine de la boutique et la version d'API.
--   Aucun secret n'y vivait (le jeton était dans l'environnement du poste), et
--   il est révoqué depuis la désinstallation.
-- - `pim.shopify_product_binding` / `pim.shopify_variant_binding` — des ÉTATS
--   DE SYNCHRO re-dérivables. Leur perte est sans conséquence par construction :
--   un re-push les reconstruisait intégralement.
-- - `pim.shopify_push_snapshot` — celle-ci est un **journal append-only**, et
--   c'est la seule perte réelle : l'historique des poussées vers la boutique et
--   la matière d'un rollback. Sans boutique à pousser ni à ramener en arrière,
--   il n'a plus de lecteur.
--
-- Plus les trois enums qui n'étaient portés que par ces colonnes :
-- `ShopifySyncStatus`, `ShopifyChannelMode`, `ShopifyPushOutcome`.
--
-- ## Ce qu'un retour arrière demanderait
--
-- Un `DROP TABLE` n'est pas réversible. Revenir en arrière veut dire :
--
-- 1. rejouer les `CREATE TYPE` / `CREATE TABLE` de
--    `20260820160000_schema_pim` (lignes 28-34, 139-185), leurs index et les
--    deux clés étrangères vers `pim.product` et `pim.product_variant` ;
-- 2. restaurer le CONTENU depuis une sauvegarde Postgres antérieure à ce
--    déploiement — rien dans le dépôt ne permet de le reconstituer ;
-- 3. réinstaller l'app côté Shopify pour qu'un nouveau jeton existe, l'ancien
--    étant révoqué par la désinstallation.
--
-- Autrement dit : les bindings se reconstruiraient d'eux-mêmes, l'historique
-- des poussées non.
--
-- ## Ce qui NE tombe PAS avec eux
--
-- ⚠️ `pim.sales_context.handle_suffix` et `pim.sales_context.shopify_projected`
-- RESTENT. Ce sont des champs obligatoires d'un contrat servi au back-office,
-- qui est EN SERVICE : les retirer est un chantier à trois déploiements
-- (étendre, basculer, resserrer), pas une ligne de plus ici.
--
-- Aucune autre table ne référence celles-ci : les deux seules clés étrangères
-- partent DES tables Shopify vers le socle, jamais l'inverse (le socle ne
-- pointe jamais vers un canal — ADR-13). Le `DROP` est donc local, et l'ordre
-- entre les quatre n'a pas d'importance.

DROP TABLE "pim"."shopify_push_snapshot";
DROP TABLE "pim"."shopify_variant_binding";
DROP TABLE "pim"."shopify_product_binding";
DROP TABLE "pim"."shopify_settings";

DROP TYPE "pim"."ShopifyPushOutcome";
DROP TYPE "pim"."ShopifyChannelMode";
DROP TYPE "pim"."ShopifySyncStatus";
