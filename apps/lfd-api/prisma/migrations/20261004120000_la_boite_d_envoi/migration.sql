-- LA BOÎTE D'ENVOI — plan `documentation/journalisation/plan-boite-d-envoi.md`,
-- lot BE1 (§7 v2, §8).
--
-- ADDITIVE : un schéma neuf, deux tables neuves, aucune ligne existante
-- touchée, aucun droit accordé à un rôle.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE "platform"."outbox_delivery"`,
-- `DROP TABLE "platform"."outbox"`, `DROP SCHEMA "platform"`. Ne perd que les
-- faits durables écrits entre-temps — aucun émetteur n'en écrit en BE1.

CREATE SCHEMA IF NOT EXISTS "platform";

CREATE TABLE "platform"."outbox" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "trace_id" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbox_key_key" ON "platform"."outbox"("key");

CREATE TABLE "platform"."outbox_delivery" (
    "event_id" TEXT NOT NULL,
    "subscriber" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "claimed_until" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "last_error" TEXT,

    CONSTRAINT "outbox_delivery_pkey" PRIMARY KEY ("event_id","subscriber")
);

ALTER TABLE "platform"."outbox_delivery" ADD CONSTRAINT "outbox_delivery_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "platform"."outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index PARTIEL, écrit à la main (Prisma ne sait pas le dire) : le relais ne
-- lit que les livraisons en attente, qui restent peu nombreuses quand les
-- livrées s'accumulent.
CREATE INDEX "outbox_delivery_pending_idx" ON "platform"."outbox_delivery"("next_attempt_at")
    WHERE "delivered_at" IS NULL;
