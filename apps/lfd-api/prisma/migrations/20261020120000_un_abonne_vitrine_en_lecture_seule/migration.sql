-- Un abonné de la vitrine en LECTURE SEULE (décision Hugo, 2026-10-20 ;
-- documentation/webhooks/vitrine.md). Cas réel : l'agence du site Joomla lit
-- le flux XML avec sa clé et ne veut recevoir aucun POST.
--
-- Additive : `endpoint_url` devient NULLABLE. Aucune donnée n'est réécrite —
-- les abonnés existants gardent leur adresse. Aucun droit n'est accordé à un
-- rôle.
--
-- Retour arrière :
--   ALTER TABLE "public"."vitrine_subscribers" ALTER COLUMN "endpoint_url" SET NOT NULL;
-- ⚠️ Il ÉCHOUE dès qu'un abonné en lecture seule existe (une ligne à NULL).
-- Le code d'avant le refuserait de toute façon à la relecture : couper ces
-- abonnés ne suffit pas, il faut leur donner une adresse (ou décider de leur
-- sort) avant de revenir en arrière.

-- AlterTable
ALTER TABLE "public"."vitrine_subscribers" ALTER COLUMN "endpoint_url" DROP NOT NULL;
