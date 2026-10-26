-- LE DÉLAI D'ANNULATION FIGÉ LUI-MÊME — `orders.customer_cancellation_fixed`,
-- `orders.customer_cancellation_hours_before`
--
-- Décision de Hugo, 2026-10-26, suite de `20261026170000_le_delai_d_annulation_fige` :
-- l'instant seul ne suffisait pas.
--   1. « Sans délai » se fige aussi : un particulier qui commande quand le
--      réglage n'impose aucun délai le reste, même si le délai est réactivé.
--      `customer_cancellable_until` NULL ne distinguait pas ce cas d'une
--      commande d'avant la colonne — le booléen le fait.
--   2. Une révision du jour ou du créneau recalcule l'instant avec le délai
--      d'ORIGINE (`customer_cancellation_hours_before`), pas avec le réglage
--      du jour.
-- Doc : `documentation/commandes/annulation/annulation-par-le-client.md`.
--
-- Strictement ADDITIVE, aucun remplissage. Les commandes passées entre la
-- migration précédente et celle-ci (instant posé, booléen faux) gardent leur
-- instant ; le code relit leur délai sur l'écart entre l'ancre et l'instant.
-- L'ancien binaire n'écrit pas ces colonnes : il fige l'instant seul, comme hier.
--
-- Retour arrière : `ALTER TABLE "public"."orders" DROP COLUMN
-- "customer_cancellation_fixed", DROP COLUMN "customer_cancellation_hours_before";`
-- — les commandes figées sans délai retombent sur le réglage du jour.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "customer_cancellation_fixed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customer_cancellation_hours_before" INTEGER;
