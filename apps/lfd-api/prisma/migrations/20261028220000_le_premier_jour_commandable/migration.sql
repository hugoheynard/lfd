-- LE PREMIER JOUR COMMANDABLE, PAR CLIENTÈLE — lot J1 de
-- `documentation/commandes/passation/plan-premier-jour-commandable.md`.
--
-- Deux journées de service facultatives sur le réglage d'ouverture : la
-- boutique ne prend, de cette clientèle, que des commandes pour ce jour ou un
-- jour suivant. `DATE`, jamais un instant : une journée de service ne passe pas
-- par minuit UTC. `NULL` = aucune restriction — l'état de toute ligne
-- existante, donc rien ne se ferme au déploiement.
--
-- ADDITIF : deux colonnes nullables, aucune ligne réécrite.
--
-- Retour arrière : supprimer les deux colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."order_opening_settings"
  ADD COLUMN "first_service_day_b2b" DATE,
  ADD COLUMN "first_service_day_b2c" DATE;
