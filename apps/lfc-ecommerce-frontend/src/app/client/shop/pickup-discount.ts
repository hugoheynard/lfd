import type {
  AudiencePickupDiscount,
  CartAdjustment,
  CustomerAudience,
  PickupAddressView,
} from '@lfd/contracts';
import { pickupDiscountFor } from '@lfd/contracts/shop-values';

import { fill } from '../copy/client-copy.service';
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

/**
 * La réduction d'un point pour une clientèle, ou `null`.
 *
 * ⚠️ Depuis le 2026-10-22, chaque clientèle a SA remise, avec des familles ou
 * des produits exclus (plan `plan-remise-retrait-par-clientele-et-exclusions.md`).
 * L'étiquette le dit (« sur une sélection », {@link coversSelection}) ; le
 * panier dit l'assiette chiffrée que le devis rend (lot C, 2026-10-23).
 */
export function pickupAdjustmentFor(
  point: PickupAddressView,
  audience: CustomerAudience,
): CartAdjustment | null {
  return pickupDiscountFor(point, audience)?.adjustment ?? null;
}

/** Ce qu'un point promet à une clientèle, en une étiquette. */
export interface PickupOffer {
  readonly label: string;
  /** Vrai quand l'étiquette annonce une remise, et non un tarif. */
  readonly hasOffer: boolean;
}

/** Les trois libellés dont l'étiquette est faite. */
export interface PickupOfferCopy {
  readonly discountTag: string;
  /** La même étiquette quand la remise ne couvre qu'une partie du catalogue. */
  readonly discountTagSelection: string;
  readonly proPrice: string;
  readonly shopPrice: string;
}

/**
 * « −20 % sur tout », ou le tarif qu'on y paie sans remise : « Prix pro » à une
 * société active, « Prix boutique » à un particulier (Hugo, 2026-09-15).
 *
 * Une seule écriture pour le dialogue et les cartes de boutique : deux
 * étiquettes calculées chacune de son côté finiraient par se contredire, comme
 * la carte et le dialogue l'ont déjà fait sur le pourcentage.
 */
export function pickupOffer(
  point: PickupAddressView,
  audience: CustomerAudience,
  copy: PickupOfferCopy,
): PickupOffer {
  const discount = pickupDiscountFor(point, audience);
  if (discount === null) {
    return { label: audience === 'b2b' ? copy.proPrice : copy.shopPrice, hasOffer: false };
  }
  const tag = coversSelection(discount) ? copy.discountTagSelection : copy.discountTag;
  return { label: fill(tag, { value: discountLabel(discount.adjustment) }), hasOffer: true };
}

/**
 * Vrai quand la remise ne couvre pas TOUT le catalogue : mode `only`, ou au
 * moins une règle qui exclut. « Sur tout » serait alors une promesse que le
 * panier démentirait. En `all_except`, une règle qui réinclut ne retire rien
 * qu'une autre règle n'ait déjà exclu : seules les exclusions comptent.
 */
export function coversSelection(discount: AudiencePickupDiscount): boolean {
  if (discount.scope === 'only') {
    return true;
  }
  return [...discount.categories, ...discount.products].some((rule) => !rule.eligible);
}

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
    .map((point) => pickupAdjustmentFor(point, audience))
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
