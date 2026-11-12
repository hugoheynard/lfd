-- LA PURGE DES INTENTIONS DES GESTES — décidée par Hugo le 2026-11-12 :
-- une intention réclamée depuis plus de sept jours est supprimée chaque nuit
-- (`admin/intents/purge`), par lots, de la plus ancienne à la plus récente.
-- L'index borne cette lecture.
--
-- ADDITIVE : un index, rien d'autre.
--
-- Un `CREATE INDEX` simple, pas `CONCURRENTLY` : Prisma joue la migration dans
-- une transaction, où `CONCURRENTLY` est refusé. La table est petite (un
-- geste du staff par ligne), le verrou d'écriture le temps de la construction
-- se compte en millisecondes.
--
-- Retour arrière : `DROP INDEX "platform"."gesture_intent_claimed_at_idx"`.

-- CreateIndex
CREATE INDEX "gesture_intent_claimed_at_idx" ON "platform"."gesture_intent"("claimed_at");
