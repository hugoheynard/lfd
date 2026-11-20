import type { SheetMoney } from "@lfd/contracts";

import { money } from "./order-sheet-pdf-format.js";
import type { TotalRow } from "./order-sheet-pdf-totals.js";

/** Le libellé de la ligne quand la livraison est offerte par le franco de la route. */
export const FREE_DELIVERY_LABEL = "Livraison offerte";

/** Le libellé de la ligne du barème offert, celui d'une livraison payée. */
const DELIVERY_LABEL = "Livraison";

/**
 * **La livraison offerte sur un papier** (doc `frais-et-livraison-offerte.md`,
 * § 2.6 et § 2.8) : deux lignes qui s'annulent — « Livraison » au barème,
 * puis « Livraison offerte » (ou le libellé français de la promotion, figé)
 * au même montant, négatif. C'est la forme d'une remise : un libellé, un
 * montant signé.
 *
 * AFFICHÉE, pas comptable : le frais facturé vaut 0, et ces lignes restent
 * hors de toute somme et de la répartition TTC des gestes — le total ne
 * bouge pas d'un centime.
 *
 * `ttc` : le papier public écrit le TTC figé ; une commande qui n'en porte
 * pas écrit le HT et le dit.
 */
export function freeDeliveryRows(totals: SheetMoney, ttc: boolean): readonly TotalRow[] {
  const free = totals.freeDelivery;
  if (free === undefined || free.waivedCents === 0) {
    return [];
  }
  const label = free.label?.fr ?? FREE_DELIVERY_LABEL;
  const cents = ttc ? (free.waivedTtcCents ?? free.waivedCents) : free.waivedCents;
  const suffix = ttc && free.waivedTtcCents === null ? " (HT)" : "";
  return [
    { label: `${DELIVERY_LABEL}${suffix}`, value: money(cents) },
    { label: `${label}${suffix}`, value: money(-cents) },
  ];
}
