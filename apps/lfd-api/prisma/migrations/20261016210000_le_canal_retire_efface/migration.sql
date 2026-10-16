-- L'ancien canal de vente en ligne, effacé des données plutôt que renommé.
--
-- Ordre de Hugo, 2026-10-16 : « tu peux pas faire un clean des faits passés,
-- ça n'a jamais été en utilisation » → « ok supprime, et les modifs aussi ».
-- Plan `documentation/pim/plan-retrait-integral-de-shopify.md`, section
-- « Nettoyage plutôt que renommage ». Passe APRÈS
-- `20261016200000_le_canal_retire_sans_son_nom`, qui avait renommé ces clés
-- et cette valeur : on efface ici ce qu'elle avait traduit.
--
-- ⚠️ IRRÉVERSIBLE. Les clés retirées et les lignes supprimées n'ont pas de
-- copie. Compter avant (aperçu en lecture seule du runbook).
--
-- Vérifié le 2026-10-16 : aucune clé étrangère ne pointe vers
-- `growth.activity_events` ni vers `pim.catalog_revision_publication` ; aucun
-- hachage ni chaînage ne porte sur `payload` (la clé d'idempotence vaut
-- `type:subjectId:traceId`) ; `lastPublished` ne filtre pas sur `channel`, et
-- l'empreinte de projection stockée n'est relue par personne.

-- 1. `sales_context.created` : les deux clés quittent la charge.
UPDATE "growth"."activity_events"
SET "payload" = "payload" - 'projectedToFormerChannel' - 'formerChannelHandleSuffix'
WHERE "type" = 'sales_context.created'
  AND ("payload" ? 'projectedToFormerChannel' OR "payload" ? 'formerChannelHandleSuffix');

-- 2. Un `.updated` qui ne portait QUE ces réglages ne dirait plus rien une
--    fois nettoyé : supprimé, sur ordre. Fait AVANT le nettoyage, pour ne
--    viser que ces lignes-là et pas un `changes` qui aurait été vide d'avance.
DELETE FROM "growth"."activity_events"
WHERE "type" = 'sales_context.updated'
  AND jsonb_typeof("payload" -> 'changes') = 'object'
  AND (("payload" -> 'changes') ? 'projectedToFormerChannel'
    OR ("payload" -> 'changes') ? 'formerChannelHandleSuffix')
  AND (("payload" -> 'changes') - 'projectedToFormerChannel' - 'formerChannelHandleSuffix') = '{}'::jsonb;

-- 3. Les autres `.updated` : les deux clés quittent `changes`.
UPDATE "growth"."activity_events"
SET "payload" = jsonb_set(
  "payload",
  '{changes}',
  ("payload" -> 'changes') - 'projectedToFormerChannel' - 'formerChannelHandleSuffix'
)
WHERE "type" = 'sales_context.updated'
  AND jsonb_typeof("payload" -> 'changes') = 'object'
  AND (("payload" -> 'changes') ? 'projectedToFormerChannel'
    OR ("payload" -> 'changes') ? 'formerChannelHandleSuffix');

-- 4. Les publications de révision vers l'ancien canal.
DELETE FROM "pim"."catalog_revision_publication"
WHERE "channel" = 'former_channel';
