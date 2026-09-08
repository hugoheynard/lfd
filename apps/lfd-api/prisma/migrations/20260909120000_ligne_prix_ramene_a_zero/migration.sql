-- **Consigner le prix ramené à zéro sur la ligne de commande.**
--
-- `resolvePrice` ramène à zéro un prix passé sous zéro depuis toujours, et le
-- consigne dans son résultat. La trace FIGÉE sur la ligne ne le portait pas :
-- une remise « −5 € » sur une baguette à 2,00 € produisait un dernier étage à
-- −300 000 et un prix facturé à 0, écart que rien n'expliquait — et la ligne
-- refusait d'exister. Un 500 sur le chemin qui encaisse, pour une remise qu'un
-- commercial a le droit de saisir.
--
-- **Additive et réversible.** Colonne nullable, aucun défaut, aucune reprise :
-- `NULL` veut dire « ligne écrite avant cette migration, on ne sait pas ». Ce
-- n'est PAS `false` — une ligne ramenée à zéro puis relevée par un plancher
-- pouvait s'écrire avant, sans que rien ne le consigne. Un `DEFAULT false`
-- aurait transformé cette ignorance en affirmation sur les seules lignes qu'on
-- ne peut plus vérifier, et c'est exactement l'arbitrage déjà fait pour
-- `base_price_millicents` et `vat_shares`.
ALTER TABLE "public"."order_lines"
  ADD COLUMN "pricing_clamped_to_zero" BOOLEAN;
