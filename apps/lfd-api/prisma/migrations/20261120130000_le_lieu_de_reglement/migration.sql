-- ───────────────────────────────────────────────────────────────────────────
-- LE LIEU DE RÈGLEMENT — une commande réglée à la caisse de la boutique.
--
-- Plan documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md,
-- § 4.1 et § 4.3 (lot B1). Une commande d'un particulier notée au comptoir se
-- règle sur la caisse de la boutique, que notre système ne connaît pas : il ne
-- sait JAMAIS qu'elle est payée (documentation/comptabilite/caisse/pas-de-logiciel-de-caisse.md).
-- `payment_status` reste donc `not_required`, et une colonne neuve dit OÙ
-- l'argent sera pris.
--
-- ADDITIVE, aucune ligne réécrite : `settlement_venue` est nullable, et `NULL`
-- vaut pour toute commande existante.
--
-- La forme d'une ligne `shop_till` (CHECK) et son gel (déclencheur) sont dans
-- le dossier suivant : un dossier par geste.
--
-- Retour arrière : `prisma/rollback/20261120130000_le_lieu_de_reglement.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TYPE "public"."SettlementVenue" AS ENUM ('shop_till');

ALTER TABLE "public"."orders"
  ADD COLUMN "settlement_venue" "public"."SettlementVenue";
