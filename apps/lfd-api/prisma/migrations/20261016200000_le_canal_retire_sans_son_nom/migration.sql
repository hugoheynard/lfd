-- Le retrait intégral de l'ancien canal de vente en ligne (Shopify), côté base.
--
-- Plan `documentation/pim/plan-retrait-integral-de-shopify.md`, S6 et sa
-- contradiction (2026-10-16). Le canal est parti le 2026-09-21
-- (`20260921220000_retrait_des_tables_shopify`) ; il restait son vocabulaire
-- dans deux colonnes, dans des faits de journal passés et dans des lignes de
-- publication. Cette migration est le SEUL fichier neuf du dépôt qui écrit son
-- nom : elle doit nommer ce qu'elle remplace.
--
-- ⚠️ IRRÉVERSIBLE. La réécriture des faits n'a pas d'inverse écrit, et le
-- `DROP` perd les suffixes de handle et l'indicateur « projeté ». Un retour
-- arrière recrée des colonnes VIDES. Compter avant (aperçu en lecture seule du
-- runbook), et faire relire par `lecteur-de-migrations`.
--
-- Fenêtre : la migration passe avant le déploiement du code. Pendant ces
-- secondes, l'ancien code peut lire une colonne disparue ou un fait renommé.
-- Accepté en pré-release (CLAUDE.md §0).

-- 1. Les faits de journal `sales_context.*`.
--
-- Une TRADUCTION, comme `20260825160000_journal_faits_renommes` : même fait,
-- même sujet, même valeur — seule la clé change de nom (CLAUDE.md §8). La clé
-- d'idempotence ne dérive PAS de la charge (`type:subjectId:traceId`,
-- `activity-event.ts`, vérifié le 2026-10-16) : elle ne bouge pas. Aucun
-- hachage ni chaîne d'intégrité ne porte sur `payload`.
--
-- `.created` porte les clés au premier niveau ; `.updated` sous `changes`
-- (chaque valeur y est un `{ from, to }`). Une clé absente reste absente : on
-- ne fabrique pas un `null` que la forme stricte refuserait.

UPDATE "growth"."activity_events"
SET "payload" = ("payload" - 'shopifyProjected' - 'handleSuffix')
  || CASE WHEN "payload" ? 'shopifyProjected'
       THEN jsonb_build_object('projectedToFormerChannel', "payload" -> 'shopifyProjected')
       ELSE '{}'::jsonb END
  || CASE WHEN "payload" ? 'handleSuffix'
       THEN jsonb_build_object('formerChannelHandleSuffix', "payload" -> 'handleSuffix')
       ELSE '{}'::jsonb END
WHERE "type" = 'sales_context.created'
  AND ("payload" ? 'shopifyProjected' OR "payload" ? 'handleSuffix');

UPDATE "growth"."activity_events"
SET "payload" = jsonb_set(
  "payload",
  '{changes}',
  (("payload" -> 'changes') - 'shopifyProjected' - 'handleSuffix')
    || CASE WHEN ("payload" -> 'changes') ? 'shopifyProjected'
         THEN jsonb_build_object('projectedToFormerChannel', "payload" -> 'changes' -> 'shopifyProjected')
         ELSE '{}'::jsonb END
    || CASE WHEN ("payload" -> 'changes') ? 'handleSuffix'
         THEN jsonb_build_object('formerChannelHandleSuffix', "payload" -> 'changes' -> 'handleSuffix')
         ELSE '{}'::jsonb END
)
WHERE "type" = 'sales_context.updated'
  AND jsonb_typeof("payload" -> 'changes') = 'object'
  AND (("payload" -> 'changes') ? 'shopifyProjected' OR ("payload" -> 'changes') ? 'handleSuffix');

-- La boîte d'envoi (`platform.outbox`) n'est PAS touchée : aucun fait
-- `sales_context.*` n'y passe — le journal du référentiel écrit dans
-- `growth.activity_events`, et les faits durables du PIM sont les
-- `pim.catalog_*` / `pim.*_image_changed`, qui ne portent aucun réglage de
-- contexte (vérifié le 2026-10-16).

-- 2. Les publications de révision vers l'ancien canal.
--
-- `channel` est une chaîne libre que seul le code qui pousse écrit. Aucun
-- lecteur ne la compare (vérifié le 2026-10-16) : `lastPublished` filtre sur
-- `mode` et `outcome`, jamais sur le canal, et l'écran ne la lit pas. Renommer
-- la valeur ne fait donc d'aucune ligne un canal vivant.

UPDATE "pim"."catalog_revision_publication"
SET "channel" = 'former_channel'
WHERE "channel" = 'shopify';

-- 3. Les deux colonnes du contexte de vente. Plus lues ni écrites par le code
--    déployé avec cette migration.

ALTER TABLE "pim"."sales_context"
  DROP COLUMN "handle_suffix",
  DROP COLUMN "shopify_projected";
