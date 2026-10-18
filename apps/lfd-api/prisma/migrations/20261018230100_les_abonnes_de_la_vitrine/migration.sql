-- LES ABONNÉS DE LA VITRINE (Hugo, 2026-10-18)
--
-- Plan `documentation/webhooks/plan-webhook-vitrine.md`, lot W (§4, §5) :
-- les abonnés, la dernière empreinte émise par élément, les livraisons.
--
-- ADDITIVE : trois tables neuves, aucune reprise de données, aucun droit
-- accordé. Rien de personnel : un abonné est une organisation (nom, URL).
--
-- Retour arrière : `DROP TABLE` de `vitrine_deliveries`,
-- `vitrine_fingerprints`, `vitrine_subscribers` — ce qui perd les abonnés,
-- leurs secrets et le journal des envois : à dire à Hugo avant.

CREATE TABLE "public"."vitrine_subscribers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint_url" TEXT NOT NULL,
    "signing_secret_sealed" TEXT NOT NULL,
    "read_key_hash" TEXT NOT NULL,
    "contents" TEXT[],
    "active" BOOLEAN NOT NULL,
    "failed_at" TIMESTAMPTZ(3),
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vitrine_subscribers_pkey" PRIMARY KEY ("id"),
    -- L'URL est vérifiée par le domaine ; la base retient l'essentiel : https,
    -- sans requête ni fragment.
    CONSTRAINT "vitrine_subscribers_endpoint_https" CHECK (
        "endpoint_url" LIKE 'https://%'
        AND position('?' IN "endpoint_url") = 0
        AND position('#' IN "endpoint_url") = 0
    ),
    CONSTRAINT "vitrine_subscribers_contents_known" CHECK (
        "contents" <@ ARRAY['catalogue', 'operations', 'texts', 'featured']::TEXT[]
    ),
    CONSTRAINT "vitrine_subscribers_last_sequence_positive" CHECK ("last_sequence" >= 0)
);

CREATE UNIQUE INDEX "vitrine_subscribers_read_key_hash_key" ON "public"."vitrine_subscribers"("read_key_hash");

CREATE TABLE "public"."vitrine_fingerprints" (
    "subscriber_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "element_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "emitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vitrine_fingerprints_pkey" PRIMARY KEY ("subscriber_id", "kind", "element_key"),
    CONSTRAINT "vitrine_fingerprints_kind_known" CHECK (
        "kind" IN ('item', 'operation', 'shelf', 'text')
    )
);

CREATE TABLE "public"."vitrine_deliveries" (
    "id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sequence" INTEGER,
    "changes" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "last_status" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),

    CONSTRAINT "vitrine_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vitrine_deliveries_kind_known" CHECK ("kind" IN ('change', 'test')),
    CONSTRAINT "vitrine_deliveries_state_known" CHECK ("state" IN ('pending', 'delivered', 'failed')),
    -- Une livraison de changements a sa séquence ; un essai n'en a pas.
    CONSTRAINT "vitrine_deliveries_sequence_by_kind" CHECK (
        ("kind" = 'change' AND "sequence" > 0) OR ("kind" = 'test' AND "sequence" IS NULL)
    ),
    CONSTRAINT "vitrine_deliveries_attempts_positive" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "vitrine_deliveries_subscriber_id_sequence_key" ON "public"."vitrine_deliveries"("subscriber_id", "sequence");
CREATE INDEX "vitrine_deliveries_state_next_attempt_at_idx" ON "public"."vitrine_deliveries"("state", "next_attempt_at");
CREATE INDEX "vitrine_deliveries_subscriber_id_created_at_idx" ON "public"."vitrine_deliveries"("subscriber_id", "created_at");

-- 🔴 UNE seule livraison de changements en vol par abonné (B3) : la suivante
-- absorbe celle qui attend. Tenu par la base, pas seulement par le code.
CREATE UNIQUE INDEX "vitrine_deliveries_one_pending_change" ON "public"."vitrine_deliveries"("subscriber_id")
    WHERE "state" = 'pending' AND "kind" = 'change';

ALTER TABLE "public"."vitrine_fingerprints" ADD CONSTRAINT "vitrine_fingerprints_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "public"."vitrine_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."vitrine_deliveries" ADD CONSTRAINT "vitrine_deliveries_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "public"."vitrine_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
