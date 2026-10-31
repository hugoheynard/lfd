import type { OrderBasketDiscount } from "../../../orders/domain/services/basket-discounts.js";
import {
  coveredLinesOf,
  type CoverableLine,
  type FrozenBasketDiscount,
} from "../../../orders/domain/services/frozen-basket-discounts.js";

/**
 * **Les remises de panier d'une commande, rejouées sur les lignes d'un bon**
 * — plan `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.2 et § 18.8 (arbitrage n° 3 : chaque remise est recomposée sur les
 * lignes parties), lot M4.
 *
 * Chaque remise garde SON ajustement et couvre SES lignes du bon (par SKU, ou
 * par le booléen d'hier quand elle vient des colonnes), dans l'ordre figé
 * de la commande. Une remise sans ajustement figé (commande d'avant la
 * colonne) ne se recompose pas : elle n'entre pas, comme la remise `null`
 * d'hier.
 */
export interface NoteBasketDiscount {
  readonly frozen: FrozenBasketDiscount;
  readonly basket: OrderBasketDiscount;
}

/** Les remises recomposables, dans leur ordre, avec leurs lignes sur CE bon. */
export function noteBasketDiscountsOf(
  discounts: readonly FrozenBasketDiscount[],
  lines: readonly CoverableLine[],
): readonly NoteBasketDiscount[] {
  return discounts.flatMap((frozen) =>
    frozen.adjustment === null
      ? []
      : [
          {
            frozen,
            basket: { adjustment: frozen.adjustment, coveredLines: coveredLinesOf(frozen, lines) },
          },
        ],
  );
}

/**
 * La règle du reliquat (plan E7 reliquat, choix 10 ; § 18.2 du plan des
 * promotions) : un pourcentage se recompose sur chaque envoi, un montant fixe
 * est compté entier sur le BL-1 et n'entre jamais dans un reliquat.
 */
export function remainderDiscountsOf(
  discounts: readonly FrozenBasketDiscount[],
): readonly FrozenBasketDiscount[] {
  return discounts.filter((discount) => discount.adjustment?.mode === "percent");
}
