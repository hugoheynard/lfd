-- LE PROJET DE HAUSSE PAR CARTE
--
-- Plan `documentation/commandes/modification/plan-s2-la-hausse.md`, lot S2.a
-- (§2.3). Une hausse d'une commande payée par carte attend ici que son
-- complément soit payé : la commande ne change pas avant.
--
-- 1. `public.order_revision_proposal` : sept états (CHECK), un complément
--    strictement positif, l'auteur sous le même CHECK qu'`order_revision`,
--    le paiement du complément (`card_payment.payment`, autre bloc : unique,
--    SANS clé étrangère).
-- 2. Un seul projet vivant par commande : index unique partiel.
-- 3. Les balayages de l'exécuteur et de l'expiration : deux index.
-- 4. Pas de DELETE : un déclencheur le refuse, sauf sous
--    `SET LOCAL orders.purge = 'on'` (la purge du scénario de dev), comme
--    `card_payment.refuse_refund_delete`. Un `TRUNCATE` n'est pas couvert :
--    voulu pour `ctx.reset()` des e2e.
--
-- ADDITIVE : une table neuve, une fonction, un déclencheur ; aucune donnée
-- touchée, aucun droit accordé. Retour arrière, tant qu'aucun projet n'est
-- écrit :
--   DROP TABLE "public"."order_revision_proposal";
--   DROP FUNCTION "public"."refuse_order_revision_proposal_delete"();

CREATE TABLE "public"."order_revision_proposal" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "base_revision" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "target_total_cents" INTEGER NOT NULL,
    "complement_cents" INTEGER NOT NULL,
    "revised_by_kind" TEXT NOT NULL,
    "revised_by_user_id" TEXT,
    "revised_by_staff_id" TEXT,
    "payment_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "leased_until" TIMESTAMPTZ(6),
    "last_failure" TEXT,
    "provider_checks" INTEGER NOT NULL DEFAULT 0,
    "refusal" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "settled_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_revision_proposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_revision_proposal_state_check" CHECK (
      "state" IN ('awaiting_payment', 'ready', 'applied', 'refused', 'stalled', 'abandoned', 'closed')
    ),
    -- Une hausse : le complément est strictement positif.
    CONSTRAINT "order_revision_proposal_complement_check" CHECK ("complement_cents" > 0),
    -- Qui a modifié : le client (son compte) ou l'équipe (sa fiche), jamais les
    -- deux — le CHECK d'`order_revision`.
    CONSTRAINT "order_revision_proposal_author_check" CHECK (
      ("revised_by_kind" = 'customer' AND "revised_by_user_id" IS NOT NULL AND "revised_by_staff_id" IS NULL)
      OR ("revised_by_kind" = 'staff' AND "revised_by_staff_id" IS NOT NULL AND "revised_by_user_id" IS NULL)
    ),
    CONSTRAINT "order_revision_proposal_counters_check" CHECK (
      "attempts" >= 0 AND "provider_checks" >= 0
    )
);

CREATE UNIQUE INDEX "order_revision_proposal_payment_id_key"
    ON "public"."order_revision_proposal"("payment_id");

-- R5 : un seul projet vivant par commande.
CREATE UNIQUE INDEX "order_revision_proposal_live_order_key"
    ON "public"."order_revision_proposal"("order_id")
    WHERE "state" IN ('awaiting_payment', 'ready', 'stalled');

CREATE INDEX "order_revision_proposal_state_next_attempt_at_idx"
    ON "public"."order_revision_proposal"("state", "next_attempt_at");

CREATE INDEX "order_revision_proposal_state_expires_at_idx"
    ON "public"."order_revision_proposal"("state", "expires_at");

ALTER TABLE "public"."order_revision_proposal"
    ADD CONSTRAINT "order_revision_proposal_order_id_fkey" FOREIGN KEY ("order_id")
    REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "public"."refuse_order_revision_proposal_delete"() RETURNS trigger AS $$
BEGIN
    IF current_setting('orders.purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'public.order_revision_proposal % : un projet de hausse ne s''efface pas — il s''abandonne, se refuse ou se ferme ; seule la purge du scénario efface, sous SET LOCAL orders.purge = ''on''.',
        OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_revision_proposal_no_delete"
    BEFORE DELETE ON "public"."order_revision_proposal"
    FOR EACH ROW EXECUTE FUNCTION "public"."refuse_order_revision_proposal_delete"();
