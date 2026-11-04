import type { DiscountLabelView, ShopQuoteView } from '@lfd/contracts';

/**
 * **Ce qui a bougé entre deux devis**, terme par terme — plan
 * `documentation/pricing/centime-et-tva/plan-total-vu.md`, § 6 (T3).
 *
 * La passation a refusé le total que le client avait vu (409
 * `orders.total_changed`) : le serveur ne reçoit qu'un nombre, il ne sait pas
 * quel terme le client avait sous les yeux. Le panier, lui, a les deux devis —
 * celui qu'il affichait au clic, et celui qu'il vient de redemander. Ce module
 * les COMPARE ; il ne calcule rien : aucune somme, aucune différence n'est
 * faite ici, seulement « ce montant du serveur est-il le même que l'autre ? ».
 *
 * L'ordre est celui dans lequel un client comprend un écart : ce qui s'ajoute
 * (la surtaxe), ce qui se paie autour (port), ce qui se retire (remises, bon),
 * puis les articles, puis la TVA.
 */
export type QuoteChange =
  | { readonly kind: 'lateFeeAppeared'; readonly amountCents: number }
  | { readonly kind: 'lateFee' }
  | { readonly kind: 'deliveryFee' }
  | { readonly kind: 'discount' }
  | { readonly kind: 'voucher' }
  | { readonly kind: 'discountEnded'; readonly label: DiscountLabelView }
  | { readonly kind: 'lineRemoved'; readonly name: string }
  | { readonly kind: 'linePrice'; readonly name: string }
  | { readonly kind: 'vat' };

/** Le nom d'un article du panier, par sa référence de vente. */
export type NameOfSku = (sku: string) => string;

export function quoteChangesOf(
  before: ShopQuoteView,
  after: ShopQuoteView,
  nameOf: NameOfSku,
): readonly QuoteChange[] {
  return [
    ...lateFeeChanges(before, after),
    ...(before.deliveryFeeCents === after.deliveryFeeCents
      ? []
      : [{ kind: 'deliveryFee' } as const]),
    ...(before.discountCents === after.discountCents ? [] : [{ kind: 'discount' } as const]),
    ...(before.voucherDiscountCents === after.voucherDiscountCents
      ? []
      : [{ kind: 'voucher' } as const]),
    ...(after.endedDiscounts ?? []).map((ended) => ({
      kind: 'discountEnded' as const,
      label: ended.label,
    })),
    ...(after.removedLines ?? []).map((line) => ({
      kind: 'lineRemoved' as const,
      name: line.name,
    })),
    ...linePriceChanges(before, after, nameOf),
    ...(sameVat(before, after) ? [] : [{ kind: 'vat' } as const]),
  ];
}

/**
 * La surtaxe de retard (T1) : absente du devis à zéro. Apparue, elle se dit
 * avec son montant — c'est le cas que Hugo a nommé ; changée ou disparue,
 * elle se nomme seulement.
 */
function lateFeeChanges(before: ShopQuoteView, after: ShopQuoteView): readonly QuoteChange[] {
  const was = before.lateFeeCents ?? 0;
  const is = after.lateFeeCents ?? 0;
  if (was === is) {
    return [];
  }
  return was === 0 ? [{ kind: 'lateFeeAppeared', amountCents: is }] : [{ kind: 'lateFee' }];
}

/** Une ligne présente dans les deux devis dont le montant n'est plus le même. */
function linePriceChanges(
  before: ShopQuoteView,
  after: ShopQuoteView,
  nameOf: NameOfSku,
): readonly QuoteChange[] {
  const previous = new Map(before.lines.map((line) => [line.sku, line]));
  return after.lines
    .filter((line) => {
      const was = previous.get(line.sku);
      return (
        was !== undefined &&
        was.quantity === line.quantity &&
        (was.unitPriceMillicents !== line.unitPriceMillicents ||
          was.lineTotalTtcCents !== line.lineTotalTtcCents)
      );
    })
    .map((line) => ({ kind: 'linePrice' as const, name: nameOf(line.sku) }));
}

/** Les mêmes parts de TVA, au même taux et au même montant. */
function sameVat(before: ShopQuoteView, after: ShopQuoteView): boolean {
  return (
    before.vat.length === after.vat.length &&
    before.vat.every(
      (share, index) =>
        share.rate === after.vat[index]?.rate &&
        share.amountCents === after.vat[index]?.amountCents,
    )
  );
}
