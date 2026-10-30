import type { ShopItemView } from '@lfd/contracts';

import type { ClientCopy } from '../copy/client-copy.model';

/**
 * **Un article listé mais non commandable** — réservé à un autre compte et
 * réglé « visible, non commandable »
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, S2, S7, L3).
 *
 * Le serveur le dit par `orderable: false` ; l'absence vaut « commandable ».
 * Seul le rayon reconnu le sert, et le devis comme la commande le refusent :
 * la boutique ne le laisse donc ni entrer au panier, ni partir au devis.
 */
export function isLocked(item: ShopItemView): boolean {
  return item.orderable === false;
}

/** La raison, dite en clair : courte pour la vignette, en phrase pour la fiche. */
export interface LockedReasonCopy {
  readonly short: string;
  readonly sentence: string;
}

/**
 * La raison d'un article verrouillé, ou `null` s'il est commandable. Une seule
 * raison existe aujourd'hui (`reserved_to_other_account`) ; un article
 * verrouillé sans raison servie la prend aussi, plutôt que de rester muet.
 */
export function lockedReason(item: ShopItemView, copy: ClientCopy): LockedReasonCopy | null {
  if (!isLocked(item)) {
    return null;
  }
  return {
    short: copy.shop.reservedToOtherAccount,
    sentence: copy.shop.reservedToOtherAccountHint,
  };
}
