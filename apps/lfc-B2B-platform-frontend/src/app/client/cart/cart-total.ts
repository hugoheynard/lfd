import type { ShopItemView } from '@lfd/contracts';
import {
  DELIVERY_VAT_RATE,
  fractionByBasisPoints,
  fromCents,
  lineTotalCents,
  roundToCents,
  ventilateVat,
  type VatShare,
} from '@lfd/money';

/** Une ligne de panier : une référence du catalogue et sa quantité. */
export interface CartLine {
  readonly product: ShopItemView;
  readonly quantity: number;
}

export type { VatShare };

/**
 * Le décompte complet d'un panier — **hors taxe d'abord**, comme une facture.
 *
 * Tous les montants sont en **centimes entiers**. Le panier a longtemps compté
 * en TTC : il convertissait chaque prix dès la vignette, puis EXTRAYAIT la TVA
 * du total. Ça donnait les mêmes nombres que la caisse sur les marchandises, et
 * un nombre faux sur le coursier — ajouté après la TVA, donc jamais taxé, donc
 * quatre euros de moins annoncés que facturés sur des frais de vingt.
 *
 * Le décompte suit désormais l'ordre d'une facture : sous-total HT, remise ou
 * coursier, une ligne par taux, total TTC. Ce n'est pas une préférence
 * d'affichage — c'est ce que `Order.draft` compose côté serveur, et le calcul
 * est maintenant littéralement le même (`ventilateVat`, dans `@lfd/money`).
 */
export interface CartTotals {
  /** Les marchandises **hors taxe**, avant remise. */
  readonly subtotalHtCents: number;
  /** Le montant RETIRÉ par la remise, positif, **HT**. Zéro quand il n'y en a pas. */
  readonly discountCents: number;
  /** Les frais de coursier, **HT**. Zéro en retrait — et alors aucune ligne. */
  readonly feeCents: number;
  /** Une part par taux RÉELLEMENT présent, du plus bas au plus haut. */
  readonly vat: readonly VatShare[];
  /** Le total **TTC** — ce qui sera débité. */
  readonly totalCents: number;
}

/** Le total **hors taxe** d'une ligne, en centimes. Un seul arrondi. */
export function lineHtCents(line: CartLine): number {
  return lineTotalCents(line.product.unitPriceMillicents, line.quantity);
}

/**
 * Ce que coûte un panier, remise et TVA comprises.
 *
 * Deux règles vivent ici, et le reste est délégué :
 *
 * 1. la remise est un **pourcentage du sous-total HT** — c'est la seule chose
 *    que cet écran sait et que `ventilateVat` ignore ;
 * 2. le coursier est un terme **hors remise**, au taux du transport : on ne
 *    fait pas de geste commercial sur une prestation, et une livraison ne se
 *    négocie pas au même endroit qu'un prix.
 *
 * ⚠️ Ce décompte est un AFFICHAGE. La caisse re-résout tout à la passation, avec
 * la mercuriale du client et ses paliers : ces nombres disent ce qu'un visiteur
 * sans tarif négocié paierait, pas ce qui sera facturé à un client qui en a un.
 */
export function priceCart(
  lines: readonly CartLine[],
  discountPercent: number,
  feeCents: number,
): CartTotals {
  const taxable = lines.map((line) => ({
    htCents: lineHtCents(line),
    vatRate: line.product.vatRatePercent,
  }));
  const subtotalHtCents = taxable.reduce((sum, line) => sum + line.htCents, 0);

  // `fractionByBasisPoints` prend « bp DE la valeur » — 10 % de. Sa jumelle
  // `scaleByBasisPoints` ALTÈRE de bp (« −10 % ») ; les deux s'écrivent avec les
  // mêmes chiffres et ne veulent pas dire la même chose.
  const discountCents = roundToCents(
    fractionByBasisPoints(fromCents(subtotalHtCents), Math.round(discountPercent * 100)),
  );

  const ventilated = ventilateVat({
    lines: taxable,
    discountCents,
    extras: feeCents === 0 ? [] : [{ htCents: feeCents, vatRate: DELIVERY_VAT_RATE }],
  });

  return {
    subtotalHtCents: ventilated.subtotalHtCents,
    discountCents: ventilated.discountCents,
    feeCents,
    vat: ventilated.vat,
    totalCents: ventilated.totalCents,
  };
}
