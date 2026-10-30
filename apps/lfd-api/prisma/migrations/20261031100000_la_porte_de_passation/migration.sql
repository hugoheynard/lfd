-- LA PORTE DE PASSATION — lot L1 de
-- `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`
-- (§ 13.7, § 7 B1).
--
-- `orders.buyer_kind` : `guest` (boutique publique, sans compte) ou
-- `registered` (derrière un compte reconnu, saisie de l'équipe comprise).
-- Posée désormais par la route, figée, relue par la révision. Aucun prix ne
-- la lit encore.
--
-- ADDITIF : une colonne NOT NULL DEFAULT 'registered' (défaut constant :
-- pas de réécriture de la table), deux CHECK, et la reprise des commandes
-- existantes dans la même transaction.
--
-- ─── La reprise, et pourquoi pas « auth0_sub IS NULL » seul ────────────────
--
-- Le plan disait « invité = la personne n'a pas d'identité de connexion ».
-- C'est vrai À LA PASSATION, faux à la reprise : un invité peut devenir un
-- compte SUR LA MÊME FICHE (`guest-account-claim.ts`, `bindGuestSubject`,
-- depuis le 2026-10-11, qui posent `auth0_sub` ET `became_account_at`), et
-- ses commandes d'invité porteraient alors un `sub`. Vérifié le 2026-10-30 :
--
-- · la passation invitée n'écrit que sur une fiche sans `sub`
--   (`prisma-guest-buyer.registrar.ts`), sans société ni saisie de l'équipe ;
-- · une fiche invitée par l'équipe (membre d'une société) peut aussi être
--   sans `sub` — ses commandes sont des saisies de l'équipe ou portent une
--   société, d'où les deux premières conditions ;
-- · `became_account_at` a été repris à `created_at` pour les fiches déjà
--   connectables au 2026-10-11 (`20261011210100_le_bonus_de_bienvenue`).
--
-- Règle : `guest` ⇔ sans société, sans saisie de l'équipe, ET la fiche
-- n'était pas un compte à l'instant de la commande (pas de `sub`, ou devenue
-- compte APRÈS). Seul résidu connu : un invité ouvert en accès par l'équipe
-- AVANT le 2026-10-11 a un `became_account_at` repris à sa création, et ses
-- commandes d'invité antérieures restent `registered`. Aucun prix ne lit la
-- colonne (L1) ; l'écart, s'il existe, ne touche qu'une promotion future
-- « invités » sur une RÉVISION de ces commandes.
--
-- ⚠️ `orders.created_at` est un TIMESTAMP(3) sans fuseau écrit en UTC :
-- `AT TIME ZONE 'UTC'` le compare à `became_account_at` (TIMESTAMPTZ) quel
-- que soit le fuseau de la session.
--
-- Retour arrière : DROP des deux CHECK puis de la colonne — perte de la
-- porte de passation seulement, que rien ne lit avant L5.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN "buyer_kind" TEXT NOT NULL DEFAULT 'registered';

UPDATE "public"."orders" AS o
   SET "buyer_kind" = 'guest'
  FROM "public"."users" AS u
 WHERE u."id" = o."placed_by_user_id"
   AND o."company_id" IS NULL
   AND o."placed_by_staff_id" IS NULL
   AND (u."auth0_sub" IS NULL
        OR u."became_account_at" > (o."created_at" AT TIME ZONE 'UTC'));

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_buyer_kind_check"
    CHECK ("buyer_kind" IN ('guest', 'registered')),
  ADD CONSTRAINT "orders_buyer_kind_guest_shape"
    CHECK ("buyer_kind" <> 'guest' OR ("company_id" IS NULL AND "placed_by_staff_id" IS NULL));
