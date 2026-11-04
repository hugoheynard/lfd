import { computed, inject, type Signal } from '@angular/core';
import type { ShopQuoteView } from '@lfd/contracts';
import { orderPretaxCents } from '@lfd/money';

import { settlesOnAccount } from '../../account/settles-on-account';
import { ClientCompany } from '../client-company.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { formatCents } from '../format-money';
import { ClientCart } from './client-cart.service';

/**
 * **Le total que le client LIT au panier** — HT au compte, TTC sinon. Le HT
 * se lit sur les montants HT du devis par la règle du bon PDF
 * (`orderPretaxCents`) ; il était « total moins TVA » jusqu'au 2026-11-04, une
 * seconde formule pour le même nombre.
 *
 * Deux lecteurs : la ligne « Total » du panier (`CartSummary`), et le seuil
 * des suggestions du staff (RS8, `StaffCartSuggestion`), qui se juge sur ce
 * même nombre — le staff écrit « si le panier atteint 20 € » en pensant à ce
 * que le client voit.
 */
export function shownCartTotalCents(totals: ShopQuoteView, onAccount: boolean): number {
  if (!onAccount) {
    return totals.totalCents;
  }
  return quotePretaxCents(totals);
}

/** Le HT d'un devis : la règle du bon PDF, sur ses montants HT. */
export function quotePretaxCents(totals: ShopQuoteView): number {
  return orderPretaxCents({
    subtotalCents: totals.subtotalHtCents,
    discountCents: totals.discountCents,
    voucherDiscountCents: totals.voucherDiscountCents,
    deliveryFeeCents: totals.deliveryFeeCents,
    lateFeeCents: totals.lateFeeCents ?? 0,
  });
}

/**
 * Le même total, écrit avec sa base — « 7,58 € HT » au compte, « 8,00 € TTC »
 * sinon (Hugo, 2026-10-27 : « Régler » et le panier de l'en-tête ne disaient
 * pas laquelle). À appeler dans un contexte d'injection.
 */
export function shownCartTotalLabel(): Signal<string> {
  const cart = inject(ClientCart);
  const firm = inject(ClientCompany);
  const t = inject(ClientCopyService).t;
  return computed(() => {
    const onAccount = settlesOnAccount(firm.company());
    const suffix = onAccount ? t().shop.htSuffix : t().shop.ttcSuffix;
    return `${formatCents(shownCartTotalCents(cart.totals(), onAccount))} ${suffix}`;
  });
}
