-- LA PURGE DE LA BOÎTE D'ENVOI — plan
-- `documentation/editeur-de-contenu/plan-service-e-mails.md`, § 7 (Hugo,
-- 2026-11-06) : un message livré depuis plus de 30 jours est éligible à la
-- purge, bâtie à blanc (`OUTBOX_PURGE=dry-run` par défaut).
--
-- ADDITIVE : un index, rien d'autre. La purge lit les messages anciens par
-- `occurred_at` (un fait précède sa livraison), par lots bornés : sans index,
-- chaque lot relirait toute la table.
--
-- Retour arrière : `DROP INDEX "platform"."outbox_occurred_at_idx"`.

-- CreateIndex
CREATE INDEX "outbox_occurred_at_idx" ON "platform"."outbox"("occurred_at");
