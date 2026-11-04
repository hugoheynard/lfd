-- ───────────────────────────────────────────────────────────────────────────
-- LE RAPPORT PRO QUITTE LA BASE — `pim.accounting_rules` est supprimée.
--
-- Ordre de Hugo, 2026-11-04 (« on peut se débarrasser de pro_price_ratio_bp
-- et pro_price_method »). La table ne portait que ces deux colonnes, mortes
-- depuis le 2026-10-27 (`20261027110000_le_prix_pro_est_toujours_saisi` : le
-- prix pro est toujours saisi, plus aucun code ne lit ni n'écrit la table).
--
-- Ce qui part : la ligne singleton (`id = 'accounting'`) si elle existe, sa
-- valeur de rapport et sa méthode (`entered`), et les deux contraintes
-- `accounting_rules_pro_ratio_bounds` et `accounting_rules_method_known`.
-- Ce qui RESTE : les faits passés du journal (`accounting_rules.*`) et
-- l'en-tête des révisions du catalogue (`proRatioBp`, `proPriceMethod`),
-- qui sont de l'histoire, pas cette table.
--
-- Retour arrière : `prisma/rollback/20261104110000_le_rapport_pro_quitte_la_base.sql`
-- (recrée la table vide ; la valeur supprimée ne se reconstitue pas, et
-- aucun code ne la lirait).
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

DROP TABLE IF EXISTS "pim"."accounting_rules";
