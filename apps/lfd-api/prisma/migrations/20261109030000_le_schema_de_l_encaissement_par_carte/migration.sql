-- LE SCHÉMA DE L'ENCAISSEMENT PAR CARTE — plan
-- `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
-- lot P0 (§4.1, §4.3), garanties G1 (§11), machine `payment.state` (§3.4).
--
-- ADDITIVE : un schéma neuf, deux enums, deux tables, leurs gardes, et la
-- reprise des premiers paiements. Aucune table existante modifiée, aucune
-- ligne existante réécrite, aucun droit accordé à un rôle. La reprise LIT
-- `public.orders`, `public.order_refund`, `public.order_refund_request` — ce
-- qu'une migration peut faire ; le code du bloc `src/card-payment/` (à venir)
-- ne les lira jamais.
--
-- 🔴 Ce que Prisma ne sait pas écrire est ici et nulle part dans le schéma :
-- les deux CHECK, l'index unique partiel et les trois déclencheurs. Le modèle
-- `CardPayment` (`prisma/schema/card_payment.prisma`) le dit dans son JSDoc.
--
-- RETOUR ARRIÈRE (migration EN AVANT, avant que le code n'écrive dans la
-- table) : `DROP SCHEMA "card_payment" CASCADE`. Après P0 déployé, il perd
-- les paiements rattachés depuis : à ne pas faire.
--
-- CONTRÔLE — à lancer après le déploiement :
--
--   SELECT state, count(*) FROM card_payment.payment GROUP BY 1 ORDER BY 1;
--   SELECT count(*) FROM public.orders WHERE stripe_payment_intent_id IS NOT NULL;
--   SELECT * FROM card_payment.takeover;
--
-- La somme des `state` vaut le second compte ; le témoin `P0` existe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE SCHÉMA, LES ENUMS, LES TABLES (ce que Prisma a écrit)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "card_payment";

-- CreateEnum
CREATE TYPE "card_payment"."CardPaymentState" AS ENUM ('pending', 'paid', 'failed', 'closed');

-- CreateEnum
CREATE TYPE "card_payment"."CardPaymentRole" AS ENUM ('first', 'complement');

-- CreateTable
CREATE TABLE "card_payment"."payment" (
    "id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "provider_ref" TEXT,
    "role" "card_payment"."CardPaymentRole" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "state" "card_payment"."CardPaymentState" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
    -- G1 : un montant demandé est strictement positif (§4.3).
    CONSTRAINT "payment_amount_positive" CHECK ("amount_cents" > 0),
    -- G1 : le compte est l'un de ceux du registre `card-accounts` (§3.2). Un
    -- compte neuf (`lfc-caisse-epargne`) est une migration qui élargit cette
    -- liste ; la porte `lint:card-accounts` (à venir, §4.1) comparera les deux.
    CONSTRAINT "payment_account_known" CHECK ("account" IN ('lfc-stripe'))
);

-- CreateTable
CREATE TABLE "card_payment"."takeover" (
    "lot" TEXT NOT NULL,
    "migrated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "takeover_pkey" PRIMARY KEY ("lot")
);

-- CreateIndex
CREATE INDEX "payment_subject_type_subject_id_idx" ON "card_payment"."payment"("subject_type", "subject_id");

-- CreateIndex
-- G1 : une référence prestataire est unique PAR COMPTE (§4.3). `NULL` n'entre
-- pas en conflit : une ligne sans référence ne bloque personne.
CREATE UNIQUE INDEX "payment_account_provider_ref_key" ON "card_payment"."payment"("account", "provider_ref");

-- G1 : un seul premier paiement par sujet (§4.3) ; les compléments (S2) sont
-- libres. Partiel : Prisma ne sait pas l'exprimer.
CREATE UNIQUE INDEX "payment_first_per_subject_key"
    ON "card_payment"."payment"("subject_type", "subject_id")
    WHERE "role" = 'first';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LA MACHINE `payment.state` ET LES COLONNES IMMUABLES (§3.4)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Transitions admises, et elles seules :
--   pending → paid    (webhook payé)
--   pending → failed  (webhook refusé)
--   failed  → paid    (carte réessayée sur la même intention)
--   pending → closed  (abandon, clôture)
--   failed  → closed  (idem)
--   closed  → paid    (webhook tardif : le sujet demande le remboursement)
--   x       → x       (rejeu sans effet)
--
-- Un événement PÉRIMÉ (`failed` après `paid`, `paid` rejoué) est ignoré par le
-- code, jamais confié à ce déclencheur : un refus ici ferait répondre une
-- erreur au webhook, et Stripe rejouerait trois jours (§3.4).
--
-- Immuables : `subject_type`, `subject_id`, `account`, `role`,
-- `amount_cents` ; `provider_ref` une fois posé. Comparées par
-- `IS DISTINCT FROM` (une colonne nullable comparée par `<>` laisserait passer
-- `NULL`).

CREATE FUNCTION "card_payment"."payment_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."subject_type" IS DISTINCT FROM OLD."subject_type"
       OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id" THEN
        RAISE EXCEPTION 'card_payment.payment % : le sujet d''un paiement ne change pas (%/% demandé, %/% en base) — un autre sujet appelle un autre paiement.',
            OLD."id", NEW."subject_type", NEW."subject_id", OLD."subject_type", OLD."subject_id";
    END IF;
    IF NEW."account" IS DISTINCT FROM OLD."account" THEN
        RAISE EXCEPTION 'card_payment.payment % : le compte d''encaissement ne change pas (% en base) — l''intention vit chez ce compte.',
            OLD."id", OLD."account";
    END IF;
    IF NEW."role" IS DISTINCT FROM OLD."role" THEN
        RAISE EXCEPTION 'card_payment.payment % : le rôle d''un paiement ne change pas (% en base).',
            OLD."id", OLD."role";
    END IF;
    IF NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents" THEN
        RAISE EXCEPTION 'card_payment.payment % : le montant d''un paiement ne change pas (% centimes en base) — un écart se règle par un complément ou un remboursement.',
            OLD."id", OLD."amount_cents";
    END IF;
    IF OLD."provider_ref" IS NOT NULL
       AND NEW."provider_ref" IS DISTINCT FROM OLD."provider_ref" THEN
        RAISE EXCEPTION 'card_payment.payment % : la référence chez le prestataire est posée (%) et ne change plus.',
            OLD."id", OLD."provider_ref";
    END IF;
    IF NEW."state" IS DISTINCT FROM OLD."state"
       AND (OLD."state"::text, NEW."state"::text) NOT IN (
           ('pending', 'paid'),
           ('pending', 'failed'),
           ('failed', 'paid'),
           ('pending', 'closed'),
           ('failed', 'closed'),
           ('closed', 'paid')
       ) THEN
        RAISE EXCEPTION 'card_payment.payment % : la transition % → % n''existe pas (plan M2, §3.4) — un événement périmé s''ignore, il ne s''écrit pas.',
            OLD."id", OLD."state", NEW."state";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_guard"
    BEFORE UPDATE ON "card_payment"."payment"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."payment_guard"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PAS DE DELETE, SAUF LA PURGE (§3.4, G1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Une ligne d'argent ne s'efface pas. La purge du scénario de démonstration
-- le peut, en posant `SET LOCAL card_payment.purge = 'on'` DANS une
-- transaction : le réglage meurt avec elle. `current_setting(…, true)` rend
-- `NULL` quand rien n'est posé, et `NULL = 'on'` n'est pas vrai.
--
-- Un `TRUNCATE` (déclencheur de table) n'est pas couvert, et c'est voulu :
-- `ctx.reset()` des e2e tronque (G1, §11).
--
-- La même garde tient le témoin : un témoin effacé ferait rebalayer tout
-- l'existant par `ReplayFirstPayments`, ou plus rien (§4.3).

CREATE FUNCTION "card_payment"."refuse_delete"() RETURNS trigger AS $$
BEGIN
    IF current_setting('card_payment.purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'card_payment.% : une ligne d''encaissement ne s''efface pas — un paiement se ferme (closed) ; seule la purge du scénario efface, sous SET LOCAL card_payment.purge = ''on''.',
        TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_no_delete"
    BEFORE DELETE ON "card_payment"."payment"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refuse_delete"();

CREATE TRIGGER "takeover_no_delete"
    BEFORE DELETE ON "card_payment"."takeover"
    FOR EACH ROW EXECUTE FUNCTION "card_payment"."refuse_delete"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LA REPRISE DES PREMIERS PAIEMENTS (§4.3)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Une ligne `first` par commande qui porte `stripe_payment_intent_id` :
--   · `account` := 'lfc-stripe' — le seul compte d'aujourd'hui ;
--   · `amount_cents` := `total_cents` — plausible : une commande carte n'est
--     pas révisable (`CardOrderNotRevisableError`) ; Stripe refuse une
--     intention sous 50 centimes, le CHECK `> 0` ne peut donc pas tomber ;
--   · `state` — la règle du §4.3, conservatrice :
--       `paid`    si `payment_status ∈ {paid, refunded}`, OU si le carnet
--                 (`public.order_refund`) porte une ligne, OU si une demande
--                 de cause `paid_after_cancellation` existe (encaissée après
--                 annulation : le règlement dit `failed`, l'argent est là) ;
--       `closed`  sinon, si la commande est annulée ;
--       `failed`  sinon, si `payment_status = failed` ;
--       `pending` sinon.
--     Seule la commande TS `ReplayFirstPayments` sait fermer, par `retrieve`,
--     une intention annulée chez le prestataire : le SQL ne devine pas.
--   · `created_at` := `orders.created_at`, `paid_at` := `orders.paid_at` —
--     colonnes `timestamp` SANS fuseau, stockées en UTC : converties par
--     `AT TIME ZONE 'UTC'`, jamais par le fuseau de la session.
--
-- L'`id` : un ULID fabriqué ici, comme
-- `20260918160000_reprise_du_journal_de_l_annuaire` (même recette) :
--   · 10 caractères de temps — les millisecondes de `orders.created_at`, par
--     `extract(epoch FROM <timestamp>)`, sans passer par `timestamptz` ;
--   · 16 caractères tirés de `md5('card_payment.first:' || orders.id)` : le
--     même `id` à chaque rejeu, deux commandes jamais le même ;
--   · base 32 de Crockford, MAJUSCULES, assemblée `ORDER BY i`.
-- Aucune fonction SQL n'est créée pour ça : rien ne reste derrière.

INSERT INTO "card_payment"."payment"
    ("id", "subject_type", "subject_id", "account", "provider_ref", "role",
     "amount_cents", "state", "created_at", "paid_at")
SELECT
    (SELECT string_agg(
              substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                     ((t.ms >> (5 * (9 - i))) & 31)::int + 1, 1),
              '' ORDER BY i)
       FROM generate_series(0, 9) AS i)
    ||
    (SELECT string_agg(
              substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                     (get_byte(decode(md5('card_payment.first:' || o."id"), 'hex'), i) & 31) + 1, 1),
              '' ORDER BY i)
       FROM generate_series(0, 15) AS i),
    'order',
    o."id",
    'lfc-stripe',
    o."stripe_payment_intent_id",
    'first',
    o."total_cents",
    CASE
        WHEN o."payment_status" IN ('paid', 'refunded')
          OR EXISTS (SELECT 1 FROM "public"."order_refund" r WHERE r."order_id" = o."id")
          OR EXISTS (SELECT 1 FROM "public"."order_refund_request" q
                      WHERE q."order_id" = o."id" AND q."cause" = 'paid_after_cancellation')
            THEN 'paid'
        WHEN o."status" = 'cancelled' THEN 'closed'
        WHEN o."payment_status" = 'failed' THEN 'failed'
        ELSE 'pending'
    END::"card_payment"."CardPaymentState",
    o."created_at" AT TIME ZONE 'UTC',
    o."paid_at" AT TIME ZONE 'UTC'
  FROM "public"."orders" o
 CROSS JOIN LATERAL (
         SELECT floor(extract(epoch FROM o."created_at") * 1000)::bigint AS ms
       ) t
 WHERE o."stripe_payment_intent_id" IS NOT NULL;

-- La ligne-témoin (§4.3) : `ReplayFirstPayments` ne demande au sujet que ses
-- références créées depuis `migrated_at − 1 h`. `now()` est l'instant de la
-- transaction de la migration.
INSERT INTO "card_payment"."takeover" ("lot", "migrated_at") VALUES ('P0', now());
