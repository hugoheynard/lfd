-- LE MOMENT DE L'ENGAGEMENT BUDGÉTAIRE, SUR LA FICHE CHORUS PRO
-- (documentation/comptabilite/facturation/plan-clients-publics-chorus.md,
-- § 6 sexies, QD1).
--
-- ADDITIVE : une colonne neuve, NOT NULL avec un défaut — les fiches déjà
-- relevées prennent `at_order`, le comportement d'aujourd'hui (le numéro se
-- saisit à la commande). Les binaires en place ne la lisent ni ne l'écrivent :
-- leur upsert laisse le défaut.
--
-- `on_period_quote` : la commande se passe sans numéro, il arrive sur le devis
-- de la période. Le CHECK tient les deux valeurs ; ce sont des valeurs écrites,
-- elles ne se renomment pas.
--
-- Retour arrière : `prisma/rollback/20261124190000_le_moment_de_l_engagement.sql`.
SET lock_timeout = '5s';

ALTER TABLE "public"."company_chorus_routing"
  ADD COLUMN "commitment_timing" TEXT NOT NULL DEFAULT 'at_order';

ALTER TABLE "public"."company_chorus_routing"
  ADD CONSTRAINT "company_chorus_routing_commitment_timing_known"
  CHECK ("commitment_timing" IN ('at_order', 'on_period_quote'));
