-- LES INTENTIONS DES GESTES DU STAFF — plan
-- `documentation/editeur-de-contenu/plan-service-e-mails.md`, revue avec
-- Hugo, cas 4 (2026-11-06) : l'écran fabrique une clé par intention, et le
-- serveur s'en sert comme identifiant du geste. Un double clic ne réexécute
-- rien et rend le résultat du premier.
--
-- ADDITIVE : une table neuve, rien d'autre.
--
-- Retour arrière : `DROP TABLE "platform"."gesture_intent"`.

-- CreateTable
CREATE TABLE "platform"."gesture_intent" (
    "id" TEXT NOT NULL,
    "actor_id" VARCHAR(64) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "gesture" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "claimed_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "result" JSONB,

    CONSTRAINT "gesture_intent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gesture_intent_actor_id_key_key" ON "platform"."gesture_intent"("actor_id", "key");
