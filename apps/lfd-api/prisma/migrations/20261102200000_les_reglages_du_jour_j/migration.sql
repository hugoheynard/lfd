-- ───────────────────────────────────────────────────────────────────────────
-- LES RÉGLAGES DU JOUR J — qui peut commander pour aujourd'hui, et comment.
--
-- Cf. documentation/limites-de-commande/plan-jour-meme-sur-stock.md, §3
-- (décisions du 2026-11-02), §6 (Q3 bis), §14 (lot L3).
--
-- ADDITIVE, en un seul passage, sur la ligne unique `order_cutoff_settings` :
--
-- 1. `same_day_public_allowed` / `same_day_pro_allowed` : « autoriser le jour
--    même » séparé par clientèle. La ligne existante (s'il y en a une) recopie
--    `same_day_allowed` dans `same_day_public_allowed` — c'est le sens que
--    l'interrupteur unique prendra au lot L4 ; les pros naissent fermés.
--    `same_day_allowed` garde son sens et ses lecteurs jusqu'au lot L4.
-- 2. `same_day_pro_online` : un pro peut-il passer pour aujourd'hui en ligne,
--    hors comptoir. Fermé par défaut.
-- 3. `same_day_pro_without_credit` (`refuse` / `payment_link`) : un pro sans
--    crédit au compte, au comptoir. `refuse` par défaut.
-- 4. `shelf_hold_minutes` : combien de temps un paiement en cours tient le
--    stock de la vitrine. 30 par défaut (l'expiration boutique d'aujourd'hui),
--    de 5 à 120 (CHECK miroir du domaine). Rien ne le lit avant le lot L4.
--
-- Aucun de ces réglages n'a d'effet avant le lot L4 : aucun lecteur.
--
-- Retour arrière : `prisma/rollback/20261102200000_les_reglages_du_jour_j.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TYPE "public"."SameDayProWithoutCredit" AS ENUM ('refuse', 'payment_link');

ALTER TABLE "public"."order_cutoff_settings"
  ADD COLUMN "same_day_public_allowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "same_day_pro_allowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "same_day_pro_online" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "same_day_pro_without_credit" "public"."SameDayProWithoutCredit" NOT NULL DEFAULT 'refuse',
  ADD COLUMN "shelf_hold_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "public"."order_cutoff_settings"
  ADD CONSTRAINT "order_cutoff_settings_shelf_hold_minutes_check"
    CHECK ("shelf_hold_minutes" BETWEEN 5 AND 120);

UPDATE "public"."order_cutoff_settings"
  SET "same_day_public_allowed" = "same_day_allowed";
