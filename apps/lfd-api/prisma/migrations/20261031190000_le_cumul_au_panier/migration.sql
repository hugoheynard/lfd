-- Le cumul au panier — plan
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md,
-- § 18.6 (lot M7).
--
-- Retire le CHECK `promotions_cumulative_line_only` posé par L12
-- (20261031160000) : depuis M3, une commande porte plusieurs remises de
-- panier (`order_discounts`), et la case « Cumulable » est admise sur une
-- promotion de panier. Aucune ligne n'est écrite : toutes les promotions de
-- panier existantes portent `cumulative = false`, ce que ce CHECK tenait.
--
-- Un relâchement, pas un resserrement : aucune ligne servie ne peut le
-- violer. IRRÉVERSIBLE dans les faits (plan § 18.6) : dès qu'une commande
-- porte deux remises, elle les porte pour toujours. Remettre le CHECK
-- n'est possible qu'après `UPDATE public.promotions SET cumulative = false
-- WHERE application_point = 'basket'`, et ne refuse que pour l'avenir.

SET lock_timeout = '5s';

ALTER TABLE "public"."promotions"
  DROP CONSTRAINT "promotions_cumulative_line_only";
