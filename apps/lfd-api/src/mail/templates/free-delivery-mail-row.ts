import { discountLabelIn, type ContentLocale, type SheetMoney } from "@lfd/contracts";

import { fill } from "./copy/mail-copy.js";

/** Les mots de la ligne, pris au dictionnaire. */
export interface FreeDeliveryMailCopy {
  readonly recapFreeDelivery: string;
  /** `{amount}` = le barème offert. */
  readonly recapFreeDeliveryValue: string;
}

/** Une ligne du récapitulatif : son libellé, sa valeur. */
export interface FreeDeliveryMailRow {
  readonly label: string;
  readonly value: string;
}

/**
 * **La livraison offerte dans le récapitulatif d'un e-mail** (plan
 * `frais-et-livraison-offerte.md`) : nommée par le libellé figé
 * de la promotion dans la langue du destinataire, sinon « Livraison offerte »
 * (le franco de la route), et le barème offert — TTC figé d'une commande
 * composée en TTC, sinon HT.
 *
 * Une seule ligne, sans signe : le récapitulatif ne montre pas les frais de
 * livraison, et un montant négatif s'y lirait comme déduit du total, qui n'en
 * dépend pas (la ligne est affichée, pas comptable).
 */
export function freeDeliveryMailRows(
  totals: SheetMoney,
  copy: FreeDeliveryMailCopy,
  money: (cents: number) => string,
  locale: ContentLocale,
): readonly FreeDeliveryMailRow[] {
  const free = totals.freeDelivery;
  if (free === undefined || free.waivedCents === 0) {
    return [];
  }
  const cents =
    totals.ttcTerms === undefined ? free.waivedCents : (free.waivedTtcCents ?? free.waivedCents);
  return [
    {
      label:
        free.label === undefined ? copy.recapFreeDelivery : discountLabelIn(free.label, locale),
      value: fill(copy.recapFreeDeliveryValue, { amount: money(cents) }),
    },
  ];
}
