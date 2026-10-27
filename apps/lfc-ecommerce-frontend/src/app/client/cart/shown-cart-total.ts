import { computed, inject, type Signal } from '@angular/core';
import type { ShopQuoteView } from '@lfd/contracts';

import { settlesOnAccount } from '../../account/settles-on-account';
import { ClientCompany } from '../client-company.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { formatCents } from '../format-money';
import { ClientCart } from './client-cart.service';

/**
 * **Le total que le client LIT au panier** — HT au compte (le total du devis
 * moins sa TVA), TTC sinon. Une soustraction de deux montants du serveur, pas
 * un calcul : la remise, le bon et le port y sont déjà.
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
  return totals.totalCents - totals.vat.reduce((sum, share) => sum + share.amountCents, 0);
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
