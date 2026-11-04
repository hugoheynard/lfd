-- ───────────────────────────────────────────────────────────────────────────
-- D'OÙ VIENT LA SAISIE DE L'ÉQUIPE — comptoir ou commercial, gardée.
--
-- Décision de Hugo, 2026-11-04 : le back-office dit si une commande a été
-- « Prise au comptoir » ou « Prise par le commercial » (le client, lui, lit
-- toujours « Prise par La Folie Coffee »). L'écran de saisie envoyait déjà
-- l'origine ; le serveur ne s'en servait que pour refuser le lien de règlement.
--
-- ADDITIVE, en un seul passage, aucune ligne réécrite :
--
-- 1. `orders.entry_origin` (`commercial` / `counter`), nullable : `NULL` pour
--    toute commande du client lui-même, et pour les saisies de l'équipe
--    d'avant cette migration, dont on ne sait pas d'où elles viennent. Une
--    saisie `entry_shortcut = immediate_pickup` sans origine se LIT `counter`
--    (le raccourci n'existe qu'au comptoir) : déduit à la lecture, pas écrit.
-- 2. Un CHECK miroir de l'agrégat (`Order.draft`) : une origine de saisie ne
--    se pose que sur une commande saisie par l'équipe.
--
-- Retour arrière : `prisma/rollback/20261104100000_d_ou_vient_la_saisie.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TYPE "public"."OrderEntryOrigin" AS ENUM ('commercial', 'counter');

ALTER TABLE "public"."orders"
  ADD COLUMN "entry_origin" "public"."OrderEntryOrigin";

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_entry_origin_by_staff" CHECK (
    "entry_origin" IS NULL OR "placed_by_staff_id" IS NOT NULL
  );
