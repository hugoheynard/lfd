-- LE LIEN DE PAIEMENT D'ESSAI — doc
-- documentation/payment/les-liens-de-paiement.md, « Le lien d'essai ».
--
-- ADDITIVE : une table neuve dans le schéma `payment`, son déclencheur de
-- transitions et le refus du DELETE. Aucune ligne existante réécrite, aucun
-- droit accordé à un rôle.
--
-- L'adresse du destinataire n'est PAS ici : elle est résolue par le bloc
-- `mail` au moment d'envoyer, et ne vit que dans son suivi.
--
-- RETOUR ARRIÈRE (avant le premier essai) :
--   DROP TABLE "payment"."pay_link_test";
--   DROP FUNCTION "payment"."pay_link_test_guard"();
-- Après le premier essai : à ne pas faire — `payment_test` est alors une
-- valeur écrite dans `payment.pay_link` et `payment.card_payment`.

-- CreateTable
CREATE TABLE "payment"."pay_link_test" (
    "id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),

    CONSTRAINT "pay_link_test_pkey" PRIMARY KEY ("id"),
    -- L'essai ne devient jamais un encaissement libre : le montant fait foi
    -- par le sujet (`quote`), et la base le tient en plus.
    CONSTRAINT "pay_link_test_amount_fixed" CHECK ("amount_cents" = 100),
    CONSTRAINT "pay_link_test_state_known" CHECK (
        "state" IN ('sent', 'paid', 'refunded', 'refund_failed')
    ),
    -- Payé dès qu'il a quitté `sent` ; rendu seulement s'il l'est.
    CONSTRAINT "pay_link_test_paid_pair" CHECK (("state" = 'sent') = ("paid_at" IS NULL)),
    CONSTRAINT "pay_link_test_refunded_pair" CHECK (("state" = 'refunded') = ("refunded_at" IS NOT NULL)),
    CONSTRAINT "pay_link_test_author_present" CHECK (length(btrim("created_by_staff_id")) > 0)
);

-- Le plafond du jour compte les essais par leur instant de création.
CREATE INDEX "pay_link_test_created_at_idx" ON "payment"."pay_link_test"("created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- LES TRANSITIONS : l'auteur, le montant et la naissance ne changent pas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION "payment"."pay_link_test_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
       OR NEW."created_by_staff_id" IS DISTINCT FROM OLD."created_by_staff_id" THEN
        RAISE EXCEPTION 'payment.pay_link_test % : un essai ne change ni d''auteur, ni de montant, ni de date.',
            OLD."id";
    END IF;
    IF NEW."state" IS DISTINCT FROM OLD."state"
       AND (OLD."state", NEW."state") NOT IN (
           ('sent', 'paid'),
           ('paid', 'refunded'),
           ('paid', 'refund_failed'),
           ('refund_failed', 'refunded'),
           ('refunded', 'refund_failed')
       ) THEN
        RAISE EXCEPTION 'payment.pay_link_test % : la transition % → % n''existe pas.',
            OLD."id", OLD."state", NEW."state";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "pay_link_test_guard"
    BEFORE UPDATE ON "payment"."pay_link_test"
    FOR EACH ROW EXECUTE FUNCTION "payment"."pay_link_test_guard"();

-- La fonction de `20261109030000` : refusé, sauf sous
-- `SET LOCAL payment.purge = 'on'`.
CREATE TRIGGER "pay_link_test_no_delete"
    BEFORE DELETE ON "payment"."pay_link_test"
    FOR EACH ROW EXECUTE FUNCTION "payment"."refuse_delete"();
