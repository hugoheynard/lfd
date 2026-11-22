-- La régularisation par la porte (plan du lien vers un sujet, §5.4, lot F1).
--
-- Une régularisation neuve ne passe plus par Stripe Checkout : elle se paie
-- par le lien du bloc `payment` (sujet `free_charge`), et n'a ni session ni
-- URL hébergée. Les liens d'avant gardent les leurs jusqu'à leur clôture.
--
-- Additive : deux colonnes deviennent nullables, rien n'est réécrit. Le CHECK
-- tient la paire : les deux posées (canal `checkout`) ou les deux nulles
-- (canal `door`). Toutes les lignes existantes ont les deux posées.
--
-- L'index unique `payment_links_stripe_session_id_key` reste : Postgres admet
-- plusieurs NULL sous un index unique, l'unicité ne vaut que pour les sessions.

ALTER TABLE "public"."payment_links" ALTER COLUMN "stripe_session_id" DROP NOT NULL;
ALTER TABLE "public"."payment_links" ALTER COLUMN "url" DROP NOT NULL;

ALTER TABLE "public"."payment_links"
  ADD CONSTRAINT "payment_links_checkout_pair"
  CHECK (("stripe_session_id" IS NULL) = ("url" IS NULL));
