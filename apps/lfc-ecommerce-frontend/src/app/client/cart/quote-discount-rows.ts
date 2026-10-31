import type { CartAdjustment, DiscountLabelView, ShopQuoteView } from '@lfd/contracts';

import { formatCents, formatRate } from '../format-money';

/**
 * **Les lignes de remise d'un devis** (plan des promotions, § 18.6, lot M7) —
 * pur, partagé par le panier et la confirmation.
 *
 * Une remise au plus : LA ligne d'hier, au caractère près (`single`, déjà
 * mise en forme par l'écran). Plusieurs (`discounts`, servi à partir de
 * deux) : une ligne par remise, dans l'ordre d'application, nommée par son
 * libellé figé dans la langue de l'écran — la règle du ticket (M6).
 */
export interface QuoteDiscountRow {
  readonly label: string;
  /** HT, positif — le montant du devis, comme `discountCents`. */
  readonly cents: number;
}

export function quoteDiscountRows(
  totals: Pick<ShopQuoteView, 'discountCents' | 'discounts'>,
  single: string | null,
  unnamed: (value: string) => string,
  locale: string,
): readonly QuoteDiscountRow[] {
  const discounts = totals.discounts;
  if (discounts === undefined || discounts.length < 2) {
    return single === null ? [] : [{ label: single, cents: totals.discountCents }];
  }
  return discounts.map((discount) => ({
    label:
      discount.label === undefined
        ? unnamed(adjustmentValue(discount.adjustment))
        : labelIn(discount.label, locale),
    cents: discount.amountCents,
  }));
}

/** « 10 % » ou « 2,00 € » — la valeur que le libellé d'hier porte. */
export function adjustmentValue(adjustment: CartAdjustment | null): string {
  if (adjustment === null) {
    return '';
  }
  return adjustment.mode === 'percent'
    ? formatRate(adjustment.bp / 100)
    : formatCents(adjustment.cents);
}

/**
 * La langue d'un libellé figé, repli français — la règle de `discountLabelIn`
 * (`@lfd/contracts`), recopiée comme au ticket : une valeur du baril n'entre
 * pas dans la boutique pour une ligne.
 */
function labelIn(label: DiscountLabelView, locale: string): string {
  return locale === 'en' ? label.en : locale === 'it' ? label.it : label.fr;
}
