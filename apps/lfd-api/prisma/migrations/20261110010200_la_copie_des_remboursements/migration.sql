-- LA COPIE DES REMBOURSEMENTS — plan
-- `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
-- lot P1, §5.2 (règles (1) et (2)), §5.1.
--
-- SANS DDL, et c'est voulu (§5.2) : les tables et leurs gardes sont dans
-- `20261110010100_le_remboursement_par_carte` ; celle-ci ne fait que copier,
-- pour qu'un e2e la rejoue après `ctx.reset()`
-- (`test/card-refund-takeover-migration.e2e-spec.ts`).
--
-- Elle LIT `public.order_refund_request`, `public.order_refund`,
-- `public.invoice` et `card_payment.payment` — ce qu'une migration peut
-- faire ; le code du bloc `src/card-payment/` ne lira jamais les deux
-- premières. Elle ÉCRIT `card_payment.refund_request`, `card_payment.refund`,
-- `public.refund_credit` et le témoin. Les anciennes tables restent
-- intactes : elles font foi jusqu'à P2, et une divergence se corrige par un
-- `INSERT` écrit à la main dans les nouvelles, jamais par un retour arrière.
--
-- 🔴 CONDITION DE DÉPLOIEMENT (§5.2, règles 1 à 4) : boutique fermée, zéro
-- paiement `pending`, zéro remboursement en vol, boîte d'envoi vide pour les
-- cinq abonnés nommés. Les comptes du §13 bis sont lus le jour même — lus
-- par Hugo le 2026-11-10 : 1 remboursement, 1 demande, 0 génération > 1, 0
-- ligne sans paiement.
--
-- REJOUABLE : chaque `INSERT` est `ON CONFLICT DO NOTHING`, les `id` sont
-- conservés — une ligne ancienne = une ligne nouvelle, rapprochées par `id`.
--
-- 🔴 UNE LIGNE SANS PAIEMENT FAIT ÉCHOUER LA MIGRATION (§5.2, règle (1)), et
-- c'est voulu : la jointure vers le `first` du sujet est EXTERNE, un `NULL`
-- tombe sur `payment_id NOT NULL` au lieu d'être sauté en silence. Le compte
-- `refunds_sans_paiement` / `requests_sans_paiement` du §13 bis vaut 0.
--
-- CONTRÔLE — à lancer après le déploiement (§5.2, règle 7) :
--
--   SELECT (SELECT count(*) FROM card_payment.refund)          AS refunds,
--          (SELECT count(*) FROM public.order_refund)          AS old_refunds,
--          (SELECT count(*) FROM card_payment.refund_request)  AS requests,
--          (SELECT count(*) FROM public.order_refund_request)  AS old_requests,
--          (SELECT coalesce(sum(amount_cents), 0) FROM card_payment.refund
--            WHERE status = 'succeeded')                        AS succeeded_cents,
--          (SELECT coalesce(sum(amount_cents), 0) FROM public.order_refund
--            WHERE status = 'succeeded')                        AS old_succeeded_cents,
--          (SELECT count(*) FROM public.refund_credit)         AS credits,
--          (SELECT count(*) FROM public.order_refund
--            WHERE credit_note_id IS NOT NULL)                  AS old_credits;
--   SELECT * FROM card_payment.takeover;
--
-- Chaque paire est égale ; le témoin `P1` existe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LES DEMANDES — règle (2)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Une ligne par `order_refund_request` :
--   · `id` := `order_id` (§5.1 : la clé d'hier) ;
--   · `payment_id` := le `first` du sujet `order` (P0, §4.3) ;
--   · `form` := `remainder`, `nature` := `return`, `reason` := `cause`
--     (`cancellation`, `paid_after_cancellation`, `refund_reversed`) ;
--   · `state` — la règle (2), dans cet ordre, sur l'état CALCULÉ comme
--     `refundRequestStateOf` le fait (`order-refund-request.ts`) :
--       (a) le `re_…` est `succeeded`, OU le paiement est sans reste
--           (`payment.amount_cents` − Σ `succeeded` du carnet ≤ 0 ; égal à
--           `total_cents` pour les lignes reprises, §4.3)       ⇒ `refunded`
--       (b) le `re_…` est `failed | canceled`, OU il est nul et
--           l'échéance est nulle (elle attend le bouton)        ⇒ `stopped`
--       (c) le `re_…` est posé, absent du carnet ou vivant      ⇒ `issued`
--       (d) sinon (pas de `re_…`, une échéance, un reste)       ⇒ `to_issue`
--     La condition de déploiement veut qu'il n'y en ait AUCUNE en (c)/(d) :
--     s'il en reste, elles sont copiées telles quelles et le balayage reprend ;
--   · `issued_cents` := le montant du carnet pour ce `re_…` — ce que le
--     bandeau d'aujourd'hui affiche (`admin-order-refund-view.ts`) ; nul
--     quand le carnet ne le connaît pas ;
--   · générations, rounds, essais, échéances, bail, dernier échec : conservés.
--
-- Avant le carnet : `refund.request_id` la référence.

INSERT INTO "card_payment"."refund_request"
    ("id", "payment_id", "form", "amount_cents", "nature", "reason", "state",
     "announced_cents", "issued_cents", "requested_at", "requested_by",
     "generation", "round", "attempts", "provider_ref", "issued_at",
     "last_failure", "last_attempt_at", "claimed_until", "claim_token",
     "next_attempt_at", "settled_by_staff_id", "settled_reason")
SELECT
    q."order_id",
    p."id",
    'remainder',
    NULL,
    'return',
    q."cause"::text,
    CASE
        -- (a)
        WHEN l."status" = 'succeeded'
          OR p."amount_cents" - s."succeeded_cents" <= 0 THEN 'refunded'
        -- (b)
        WHEN l."status" IN ('failed', 'canceled')
          OR (q."stripe_refund_id" IS NULL AND q."next_attempt_at" IS NULL) THEN 'stopped'
        -- (c)
        WHEN q."stripe_refund_id" IS NOT NULL THEN 'issued'
        -- (d)
        ELSE 'to_issue'
    END::"card_payment"."CardRefundRequestState",
    q."announced_cents",
    l."amount_cents",
    q."requested_at",
    q."requested_by",
    q."generation",
    q."round",
    q."attempts",
    q."stripe_refund_id",
    q."issued_at",
    q."last_failure",
    q."last_attempt_at",
    q."claimed_until",
    q."claim_token",
    q."next_attempt_at",
    NULL,
    NULL
  FROM "public"."order_refund_request" q
  LEFT JOIN "card_payment"."payment" p
         ON p."subject_type" = 'order'
        AND p."subject_id" = q."order_id"
        AND p."role" = 'first'
  LEFT JOIN "public"."order_refund" l
         ON l."stripe_refund_id" = q."stripe_refund_id"
 CROSS JOIN LATERAL (
         SELECT coalesce(sum(r."amount_cents") FILTER (WHERE r."status" = 'succeeded'), 0)
                    AS "succeeded_cents"
           FROM "public"."order_refund" r
          WHERE r."order_id" = q."order_id"
       ) s
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LE CARNET — règle (1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Une ligne par `order_refund`, `id` conservé :
--   · `payment_id` := le `first` du sujet, `account` := le sien
--     (`lfc-stripe`, le seul compte de P0) — la clé `(payment_id, account)`
--     de la migration précédente l'exige ;
--   · `source` := `provider`, `provider_ref` := `stripe_refund_id` ;
--   · `request_id` := la demande qui porte ce `re_…` EN `stripe_refund_id`,
--     et `nature` := `return` alors seulement ; sinon les deux sont nuls — ce
--     qui classe « manuel » un `re_…` d'une génération antérieure dont
--     `reopenAfterFailure` a effacé le `stripeRefundId` : accepté (§5.2), et
--     compté avant de déployer (0 génération > 1, §13 bis) ;
--   · `currency`, `status`, montant recopiés ; `refunded_at`, `recorded_at`,
--     `updated_at` — colonnes `timestamp` SANS fuseau, stockées en UTC :
--     converties par `AT TIME ZONE 'UTC'`, jamais par le fuseau de la session.
--   · Sans `credit_note_id` : l'avoir passe à `public.refund_credit` (3).

INSERT INTO "card_payment"."refund"
    ("id", "payment_id", "account", "request_id", "nature", "source",
     "provider_ref", "amount_cents", "currency", "status", "refunded_at",
     "recorded_at", "updated_at")
SELECT
    r."id",
    p."id",
    p."account",
    q."order_id",
    CASE WHEN q."order_id" IS NOT NULL THEN 'return' END::"card_payment"."CardRefundNature",
    'provider',
    r."stripe_refund_id",
    r."amount_cents",
    r."currency",
    r."status"::text::"card_payment"."CardRefundStatus",
    r."refunded_at" AT TIME ZONE 'UTC',
    r."recorded_at" AT TIME ZONE 'UTC',
    r."updated_at" AT TIME ZONE 'UTC'
  FROM "public"."order_refund" r
  LEFT JOIN "card_payment"."payment" p
         ON p."subject_type" = 'order'
        AND p."subject_id" = r."order_id"
        AND p."role" = 'first'
  LEFT JOIN "public"."order_refund_request" q
         ON q."stripe_refund_id" = r."stripe_refund_id"
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE LIEN VERS L'AVOIR — `refund_credit` (§5.1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Une ligne par `order_refund.credit_note_id` posé : `refund_id` := l'`id`
-- du remboursement (le même des deux côtés), `reason` := `credit_note`.
-- `created_at` := l'émission de l'avoir (`invoice.created_at`, `timestamp`
-- en UTC) : l'avoir et son lien s'écrivaient dans la même transaction (E5b,
-- `order_refund.credit_note_id`), l'ancienne table n'a pas d'autre instant.

INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
SELECT r."id", r."credit_note_id", 'credit_note', i."created_at" AT TIME ZONE 'UTC'
  FROM "public"."order_refund" r
  JOIN "public"."invoice" i ON i."id" = r."credit_note_id"
 WHERE r."credit_note_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LE TÉMOIN (§4.3)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Date la copie. Aucun rattrapage ne le lit (v11 : boutique fermée, pas de
-- fenêtre) ; `ReplayFirstPayments` ne lit que le témoin `P0`. `now()` est
-- l'instant de la transaction de la migration.

INSERT INTO "card_payment"."takeover" ("lot", "migrated_at") VALUES ('P1', now())
ON CONFLICT DO NOTHING;
