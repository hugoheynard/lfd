-- Les moyens de règlement deviennent CUMULATIFS.
--
-- Une colonne unique (`payment_term`) faisait du déblocage un remplacement :
-- accorder le mensuel retirait le paiement à la commande. Or payer à la
-- commande n'est pas une condition de règlement, c'est l'absence de crédit —
-- toujours offerte. Ce qui s'accorde, ce sont des **délais**, et ils
-- s'additionnent.
--
-- Reprise des données : les 248 sociétés sont toutes en `per_order`, c'est-à-dire
-- sans aucun crédit accordé — leur ensemble part donc vide, sans perte. Une
-- valeur différée éventuelle est conservée comme premier terme accordé.

CREATE TYPE "public"."DeferredTerm" AS ENUM ('monthly', 'net60', 'net90');

ALTER TABLE "public"."companies"
  ADD COLUMN "granted_terms" "public"."DeferredTerm"[] NOT NULL DEFAULT '{}',
  ADD COLUMN "requested_term" "public"."DeferredTerm";

-- Un terme différé déjà convenu devient le premier crédit accordé.
UPDATE "public"."companies"
SET "granted_terms" = ARRAY["payment_term"::text::"public"."DeferredTerm"]
WHERE "payment_term" <> 'per_order';

-- Une demande en cours ne change pas de nature, seulement de colonne.
UPDATE "public"."companies"
SET "requested_term" = "requested_payment_term"::text::"public"."DeferredTerm"
WHERE "requested_payment_term" IS NOT NULL AND "requested_payment_term" <> 'per_order';

ALTER TABLE "public"."companies"
  DROP COLUMN "payment_term",
  DROP COLUMN "requested_payment_term";

DROP TYPE "public"."PaymentTerm";
