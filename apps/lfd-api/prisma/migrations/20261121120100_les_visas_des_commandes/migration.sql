-- LES VISAS DES COMMANDES — plan
-- documentation/commandes/back-office/plan-visa-des-commandes.md, V1.
--
-- Une ligne par visa posé. Aucune suppression : retirer remplit les deux
-- colonnes `withdrawn_*`, viser à nouveau crée une ligne ; l'historique se
-- lit en entier. Additive : une table neuve, rien de touché ailleurs.

CREATE TABLE "public"."order_reviews" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "reviewed_revision" INTEGER NOT NULL,
    "reviewed_by_staff_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "withdrawn_by_staff_id" TEXT,
    "withdrawn_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_reviews_pkey" PRIMARY KEY ("id"),
    -- Retirer garde qui ET quand : l'un sans l'autre ne se lit pas.
    CONSTRAINT "order_reviews_withdrawn_together" CHECK (
        ("withdrawn_by_staff_id" IS NULL) = ("withdrawn_at" IS NULL)
    ),
    -- Une note est absente ou dit quelque chose : jamais une chaîne vide.
    CONSTRAINT "order_reviews_note_not_empty" CHECK ("note" IS NULL OR "note" <> ''),
    CONSTRAINT "order_reviews_revision_positive" CHECK ("reviewed_revision" >= 0)
);

CREATE INDEX "order_reviews_order_id_idx" ON "public"."order_reviews"("order_id");

-- Un seul visa EN COURS par commande : le dernier gardien d'une course entre
-- deux commerciaux, que l'adaptateur traduit en refus nommé.
CREATE UNIQUE INDEX "order_reviews_one_current" ON "public"."order_reviews"("order_id")
    WHERE "withdrawn_at" IS NULL;

ALTER TABLE "public"."order_reviews" ADD CONSTRAINT "order_reviews_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
