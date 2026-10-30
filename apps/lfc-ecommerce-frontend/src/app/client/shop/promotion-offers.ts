import { computed, inject, Injectable, untracked } from '@angular/core';

import type {
  PromotionOfferEffectView,
  ShopItemFulfillmentOfferView,
  ShopItemView,
} from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';

import type { ClientCopy } from '../copy/client-copy.model';
import { ClientCopyService, fill } from '../copy/client-copy.service';
import { formatCents } from '../format-money';
import { ServicePoints } from './pickup-points.store';

const BASIS_POINTS_PER_PERCENT = 100;

/**
 * **« −20 % » ou « −5,00 € »** — l'effet d'une promotion tel qu'une mention
 * le dit (plan des promotions, lot L10). Le pourcentage garde sa décimale
 * (« 12,5 »), un entier n'en traîne pas.
 */
export function offerDiscountLabel(
  effect: PromotionOfferEffectView,
  product: Pick<ClientCopy['product'], 'discountPercent' | 'discountAmount'>,
): string {
  if (effect.kind === 'percent') {
    const pct = String(effect.basisPoints / BASIS_POINTS_PER_PERCENT).replace('.', ',');
    return fill(product.discountPercent, { pct });
  }
  return fill(product.discountAmount, { amount: formatCents(unitPriceCents(effect.millicents)) });
}

/**
 * La mention d'UNE offre — `null` quand le point qu'elle nomme n'est pas (ou
 * pas encore) dans la liste servie : une mention sans lieu promettrait la
 * remise partout.
 */
export function fulfillmentOfferLabel(
  offer: ShopItemFulfillmentOfferView,
  product: ClientCopy['product'],
  pickupLabel: (id: string) => string | null,
): string | null {
  const discount = offerDiscountLabel(offer.effect, product);
  switch (offer.fulfillment.kind) {
    case 'pickup':
      return fill(product.offerOnPickup, { discount });
    case 'delivery':
      return fill(product.offerOnDelivery, { discount });
    case 'pickup_point': {
      const place = pickupLabel(offer.fulfillment.pickupId);
      return place === null ? null : fill(product.offerAtPickupPoint, { discount, place });
    }
  }
}

/**
 * **Les mentions d'acheminement d'un article** — « −20 % avec retrait à Cœur
 * de station » (plan des promotions, § 13.2 RAYON, lot L10). Le prix du rayon
 * ne les compte pas : l'acheminement n'y est pas encore choisi, et le panier
 * les applique dès qu'il l'est.
 *
 * Le nom d'un point vient de la liste que la boutique sert déjà
 * (`ServicePoints`) ; une offre qui en nomme un la fait lire, une fois.
 */
@Injectable({ providedIn: 'root' })
export class FulfillmentOfferLabels {
  private readonly points = inject(ServicePoints);
  private readonly t = inject(ClientCopyService).t;

  private readonly labelsById = computed(
    () => new Map(this.points.pickups().map((point) => [point.id, point.label])),
  );

  /** À lire dans un `computed` : suit la langue et la liste des points. */
  of(item: ShopItemView): readonly string[] {
    const offers = item.fulfillmentOffers ?? [];
    if (offers.length === 0) {
      return [];
    }
    if (offers.some((offer) => offer.fulfillment.kind === 'pickup_point')) {
      untracked(() => void this.points.hydrate());
    }
    const labels = this.labelsById();
    const product = this.t().product;
    return offers
      .map((offer) => fulfillmentOfferLabel(offer, product, (id) => labels.get(id) ?? null))
      .filter((label): label is string => label !== null);
  }
}
