import type { OrderRevisionQuoteView, OrderRevisionUnitPrice, OrderSaleUnit } from '@lfd/contracts';
import { discountLabelIn } from '@lfd/contracts';

import { fill } from '../copy/client-copy.service';
import type { RevisionRefusalCopy } from '../copy/screens/orders.copy';
import { formatCents } from '../format-money';
import { unitPriceLabel } from '../mes-factures/invoice-format';
import { quantityLabel } from '../shop/sale-unit';

/** Un prix unitaire dit : TTC pour un particulier, HT sinon ; au kilo pour une ligne au poids. */
export function unitPriceSaid(
  price: OrderRevisionUnitPrice,
  saleUnit: OrderSaleUnit,
  copy: RevisionRefusalCopy,
): string {
  const amount =
    price.unitPriceTtcCents === null
      ? fill(copy.priceExclTax, { price: unitPriceLabel(price.unitPriceMillicents) })
      : formatCents(price.unitPriceTtcCents);
  return saleUnit === 'weight' ? fill(copy.pricePerKilo, { price: amount }) : amount;
}

/**
 * **Les refus du devis, par SKU** : la phrase du prix qui changerait (ou de
 * l'article retiré), puis celles des remises perdues. Une ligne sans refus
 * n'a pas d'entrée. Le serveur décide ; l'écran ne fait que dire.
 */
export function refusalsBySku(
  quote: OrderRevisionQuoteView,
  copy: RevisionRefusalCopy,
  locale: string,
): ReadonlyMap<string, readonly string[]> {
  const said = new Map<string, string[]>();
  const push = (sku: string, text: string): void => {
    said.set(sku, [...(said.get(sku) ?? []), text]);
  };
  const units = new Map(quote.lines.map((line) => [line.sku, line.saleUnit] as const));
  for (const line of quote.lines) {
    const refusal = line.refusal;
    if (refusal === null) {
      continue;
    }
    push(
      line.sku,
      refusal.kind === 'withdrawn'
        ? copy.lineWithdrawn
        : fill(copy.linePriceChanged, {
            frozen: unitPriceSaid(refusal.frozen, line.saleUnit, copy),
            current: unitPriceSaid(refusal.current, line.saleUnit, copy),
          }),
    );
  }
  for (const refusal of quote.discountRefusals) {
    const minimum = quantityLabel(refusal.minQuantity, units.get(refusal.sku));
    push(
      refusal.sku,
      refusal.label === null
        ? fill(copy.discountLostUnnamed, { minimum })
        : fill(copy.discountLost, { label: discountLabelIn(refusal.label, locale), minimum }),
    );
  }
  return said;
}

/** Le devis porte-t-il un refus ? Tant qu'il en porte un, rien ne se valide. */
export function hasRefusal(quote: OrderRevisionQuoteView): boolean {
  return quote.discountRefusals.length > 0 || quote.lines.some((line) => line.refusal !== null);
}
