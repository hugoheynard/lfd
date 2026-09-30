-- Les vues de compatibilité partent (plan-schema-delivery.md, SD5).
--
-- `20260930140000_la_livraison_a_son_schema` a déplacé les quatorze tables de
-- la livraison dans le schéma `delivery` et laissé dans `production` une vue
-- par table, pour l'ANCIEN binaire qui servait encore pendant les quelques
-- secondes du remplacement. Ce binaire est parti : le déploiement de
-- `618940a` (2026-09-30) est en ligne et ne lit que `delivery.*`.
--
-- Rien d'autre ne lit ces vues (vérifié le 2026-09-30 : aucun
-- `"production"."delivery_` dans apps/lfd-api/src ni test). Une vue ne porte
-- aucune donnée : la supprimer n'en perd aucune.
--
-- Retour arrière : recréer les vues (`CREATE VIEW "production"."delivery_x"
-- AS SELECT * FROM "delivery"."delivery_x"`) — inutile tant qu'aucun binaire
-- antérieur à `618940a` n'est relancé.

SET lock_timeout = '5s';

DROP VIEW IF EXISTS "production"."delivery_vehicle";
DROP VIEW IF EXISTS "production"."delivery_departure";
DROP VIEW IF EXISTS "production"."delivery_routing_settings";
DROP VIEW IF EXISTS "production"."delivery_round";
DROP VIEW IF EXISTS "production"."delivery_round_stop";
DROP VIEW IF EXISTS "production"."delivery_stop_execution";
DROP VIEW IF EXISTS "production"."delivery_geocode";
DROP VIEW IF EXISTS "production"."delivery_bin_type";
DROP VIEW IF EXISTS "production"."delivery_bin_capacity";
DROP VIEW IF EXISTS "production"."delivery_bin";
DROP VIEW IF EXISTS "production"."delivery_bin_load";
DROP VIEW IF EXISTS "production"."delivery_simulation_scenario";
DROP VIEW IF EXISTS "production"."delivery_purchase_vehicle_candidate";
DROP VIEW IF EXISTS "production"."delivery_purchase_bin_candidate";

RESET lock_timeout;
