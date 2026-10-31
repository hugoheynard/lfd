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
 * Les mentions d'UNE offre — une par acheminement qu'elle ouvre (une offre
 * porte l'ENSEMBLE depuis `documentation/promotions/plan-acheminements-a-cocher.md`).
 * Un point qui n'est pas (ou pas encore) dans la liste servie n'est pas dit :
 * une mention sans lieu promettrait la remise partout. Une sélection de zones
 * se dit « en livraison » jusqu'au lot de la boutique.
 */
export function fulfillmentOfferLabels(
  offer: ShopItemFulfillmentOfferView,
  product: ClientCopy['product'],
  pickupLabel: (id: string) => string | null,
): readonly string[] {
  const discount = offerDiscountLabel(offer.effect, product);
  const { pickup, delivery } = offer.fulfillment;
  const labels: string[] = [];
  if (pickup === 'all') {
    labels.push(fill(product.offerOnPickup, { discount }));
  } else if (pickup !== 'none') {
    for (const id of pickup.points) {
      const place = pickupLabel(id);
      if (place !== null) {
        labels.push(fill(product.offerAtPickupPoint, { discount, place }));
      }
    }
  }
  if (delivery !== 'none') {
    labels.push(fill(product.offerOnDelivery, { discount }));
  }
  return labels;
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
    if (offers.some((offer) => typeof offer.fulfillment.pickup === 'object')) {
      untracked(() => void this.points.hydrate());
    }
    const labels = this.labelsById();
    const product = this.t().product;
    return offers.flatMap((offer) =>
      fulfillmentOfferLabels(offer, product, (id) => labels.get(id) ?? null),
    );
  }
}
