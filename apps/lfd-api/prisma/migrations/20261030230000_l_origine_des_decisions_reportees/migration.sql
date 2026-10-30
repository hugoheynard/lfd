-- L'ORIGINE DES DÉCISIONS REPORTÉES — lot R0 de
-- `documentation/pricing/plan-report-apres-detachement.md`.
--
-- Une règle, un plancher, un barème ou un engagement REPORTÉ depuis l'ancienne
-- référence d'un détachement dit d'où il vient :
-- `{ "kind": "detached", "fromSku": …, "fromDecisionId": … }` — même forme
-- que l'origine d'un avenant de mercuriale. Relue et revalidée par le
-- domaine ; « déjà reporté » se juge sous verrou dans le handler, pas par une
-- unicité (un plancher versionné change d'identifiant à chaque période).
--
-- ADDITIF : quatre colonnes `jsonb` nullables, sans défaut. `NULL` = décision
-- saisie, ou posée avant ce lot. Aucune donnée réécrite.
--
-- Retour arrière : supprimer les quatre colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."price_rules" ADD COLUMN "origin" JSONB;

ALTER TABLE "public"."price_floors" ADD COLUMN "origin" JSONB;

ALTER TABLE "public"."volume_ladders" ADD COLUMN "origin" JSONB;

ALTER TABLE "public"."volume_commitments" ADD COLUMN "origin" JSONB;
