-- ───────────────────────────────────────────────────────────────────────────
-- LA LIVRAISON OFFERTE SUR LA FACTURE — figée sur la pièce à l'émission.
--
-- Plan documentation/promotions/plan-livraison-offerte.md, § 2.9. Une facture
-- se rend depuis ses propres tables, jamais depuis `orders` : la mention
-- « Livraison offerte » d'un bon se fige sur sa ligne `invoice_order`, comme
-- ses bons de livraison.
--
-- `free_delivery` (jsonb) : `{ waivedCents, waivedTtcCents | null, label? }`.
-- NULL = rien d'offert, et toute pièce émise avant cette migration — elle
-- garde son rendu. Additive : aucune ligne existante n'est écrite ; le
-- déclencheur `invoice_order_immutable` tient la colonne comme les autres.
--
-- Retour arrière : `prisma/rollback/20261120150000_la_livraison_offerte_sur_la_facture.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

ALTER TABLE "public"."invoice_order" ADD COLUMN "free_delivery" JSONB;
