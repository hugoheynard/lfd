-- LES OPTIONS AUX ATELIERS — lot G3 de
-- `documentation/catalogue/plan-options-de-commande.md` (§ 3.4).
--
-- ADDITIF : une colonne `options` (JSONB, NOT NULL DEFAULT '[]') sur trois
-- tables qui recopient une ligne de commande, chacune dans son schéma :
--
-- 1. `production.production_order_line` — le fournil (l'instantané de l'arrêt) ;
-- 2. `packing.packing_line` — le colisage (hors de la clé de la ligne) ;
-- 3. `public.delivery_note_line` — le bon de livraison, plafonné à ce qui part.
--
-- Toute ligne existante prend `[]` : aucune option n'existait avant G2.
-- Aucune colonne d'argent, aucune clé touchée. Ajouter une colonne NOT NULL
-- avec un défaut constant ne réécrit pas la table (Postgres ≥ 11).
--
-- Ordre de déploiement : cette migration → le code G3.
--
-- Retour arrière : `prisma/rollback/20261127150000_les_options_aux_ateliers.sql`.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_order_line"
  ADD COLUMN "options" JSONB NOT NULL DEFAULT '[]',
  ADD CONSTRAINT "production_order_line_options_array" CHECK (jsonb_typeof("options") = 'array');

ALTER TABLE "packing"."packing_line"
  ADD COLUMN "options" JSONB NOT NULL DEFAULT '[]',
  ADD CONSTRAINT "packing_line_options_array" CHECK (jsonb_typeof("options") = 'array');

ALTER TABLE "public"."delivery_note_line"
  ADD COLUMN "options" JSONB NOT NULL DEFAULT '[]',
  ADD CONSTRAINT "delivery_note_line_options_array" CHECK (jsonb_typeof("options") = 'array');
