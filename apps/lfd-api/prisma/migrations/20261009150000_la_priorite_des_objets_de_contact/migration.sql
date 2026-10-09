-- LA PRIORITÉ DES OBJETS DE CONTACT — ajout de Hugo au plan
-- `documentation/order/plan-nous-ecrire.md` (2026-10-09) : « faible, moyen,
-- urgent », à usage interne.
--
-- ADDITIVE : une énumération neuve, deux colonnes neuves à défaut `medium`,
-- un index neuf. Aucune ligne réécrite autrement que par le défaut, aucun
-- droit accordé. `contact_message.priority` est un INSTANTANÉ de l'objet à la
-- réception, sans lien : changer l'objet ne requalifie pas les messages reçus.
--
-- Retour arrière : `DROP INDEX`, `DROP COLUMN` des deux colonnes, puis
-- `DROP TYPE "public"."ContactPriority"`.

CREATE TYPE "public"."ContactPriority" AS ENUM ('low', 'medium', 'urgent');

ALTER TABLE "public"."contact_subject"
    ADD COLUMN "priority" "public"."ContactPriority" NOT NULL DEFAULT 'medium';

ALTER TABLE "public"."contact_message"
    ADD COLUMN "priority" "public"."ContactPriority" NOT NULL DEFAULT 'medium';

CREATE INDEX "contact_message_handled_at_priority_received_at_idx"
    ON "public"."contact_message"("handled_at", "priority", "received_at");
