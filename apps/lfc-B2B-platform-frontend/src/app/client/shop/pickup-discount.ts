import {
  type CartAdjustment,
  type CustomerAudience,
  type PickupAddressView,
  pickupDiscountFor,
} from '@lfd/contracts';

import { formatCents, formatRate } from '../format-money';

/**
 * La remise au retrait, telle que la plateforme l'annonce.
 *
 * 🔴 **La carte « Je passe le prendre » annonçait « Jusqu’à −10 % » en dur**,
 * dans ses libellés, pendant que le dialogue qu'elle ouvre lisait la remise du
 * back-office : 20 % d'un côté, 10 % de l'autre, sur le même écran (corrigé le
 * 2026-09-15). Les deux lisent désormais cette unique source.
 *
 * 🔴 **La remise d'un point vise une clientèle** depuis le 2026-09-15 (plan
 * remise et livraison par clientèle, D2) : une remise « pros seulement » ne
 * s'annonce pas en perso. Tout lecteur passe par `pickupDiscountFor`, la règle
 * que le serveur applique au devis.
 */

/** Un ajustement, tel qu'il se lit : « 10 % » ou « 2,00 € ». */
export function discountLabel(adjustment: CartAdjustment): string {
  return adjustment.mode === 'percent'
    ? formatRate(adjustment.bp / 100)
    : formatCents(adjustment.cents);
}

/**
 * La meilleure remise proposée **à cette clientèle**, ou `null`.
 *
 * Comparer un pourcentage à un montant n'a pas de sens sans panier : on retient
 * donc la meilleure de chaque nature, en préférant le pourcentage — c'est ce que
 * la phrase d'accueil vend, et la seule forme qui parle sans connaître le total.
 */
export function bestPickupDiscount(
  points: readonly PickupAddressView[],
  audience: CustomerAudience,
): CartAdjustment | null {
  const offers = points
    .map((point) => pickupDiscountFor(point, audience))
    .filter((d) => d !== null);
  const percents = offers.filter((d) => d.mode === 'percent');
  if (percents.length > 0) {
    return percents.reduce((best, d) => (d.bp > best.bp ? d : best));
  }
  const amounts = offers.filter((d) => d.mode === 'amount');
  return amounts.length === 0
    ? null
    : amounts.reduce((best, d) => (d.cents > best.cents ? d : best));
}
