import type { ShopQuoteView } from '@lfd/contracts';

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
