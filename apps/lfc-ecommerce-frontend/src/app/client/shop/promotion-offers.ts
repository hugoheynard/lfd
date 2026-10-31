import { computed, inject, Injectable, untracked } from '@angular/core';

import type {
  PromotionOfferEffectView,
  PromotionOfferHoursView,
  ShopItemFulfillmentOfferView,
  ShopItemView,
} from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';

import type { ClientCopy } from '../copy/client-copy.model';
import { ClientLocale } from '../client-locale.service';
import { ClientCopyService, fill } from '../copy/client-copy.service';
import { formatCents } from '../format-money';
import { ServicePoints } from './pickup-points.store';

const BASIS_POINTS_PER_PERCENT = 100;
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const MIDNIGHT_END = '24:00';
/** Un lundi (5 janvier 1970, UTC) : le jour `index` de la semaine s'en déduit. */
const A_MONDAY_UTC = Date.UTC(1970, 0, 5);
const DAY_MS = 86_400_000;

type HoursCopy = Pick<ClientCopy['product'], 'offerHoursRange' | 'offerMidnight'>;

/**
 * **Une heure murale** (`HH:MM`) dite dans la langue : « 17 h », « 5 PM »,
 * « 17:30 » ; « 24:00 » est minuit.
 */
export function wallHourLabel(time: string, locale: string, copy: HoursCopy): string {
  if (time === MIDNIGHT_END) {
    return copy.offerMidnight;
  }
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    ...(minutes === 0 ? {} : { minute: '2-digit' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(1970, 0, 1, hours, minutes)));
}

/**
 * **Les jours et heures d'une offre**, dits : « mardi et jeudi de 17 h à
 * 19 h » ; tous les jours, les jours se taisent (`plan-jours-et-heures.md`, § 8).
 */
export function offerHoursLabel(
  hours: PromotionOfferHoursView,
  locale: string,
  copy: HoursCopy,
): string {
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  return list.format(
    hours.windows.map((window) => {
      const range = fill(copy.offerHoursRange, {
        start: wallHourLabel(window.start, locale, copy),
        end: wallHourLabel(window.end, locale, copy),
      });
      if (window.weekdays.length === WEEK.length) {
        return range;
      }
      const days = WEEK.flatMap((day, index) =>
        window.weekdays.includes(day)
          ? [dayName.format(new Date(A_MONDAY_UTC + index * DAY_MS))]
          : [],
      );
      return `${list.format(days)} ${range}`;
    }),
  );
}

/**
 * Une mention, et ses heures quand l'offre n'agit pas maintenant : une
 * remise hors de ses heures n'est jamais dite comme active (§ 8, « Annonce »).
 */
function withHours(
  label: string,
  hours: PromotionOfferHoursView | undefined,
  product: ClientCopy['product'],
  locale: string,
): string {
  if (hours === undefined || hours.activeNow) {
    return label;
  }
  const template =
    hours.moment === 'ordered_at' ? product.offerWithHours : product.offerWithSlotHours;
  return fill(template, { offer: label, hours: offerHoursLabel(hours, locale, product) });
}

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
 * porte l'ENSEMBLE depuis `documentation/promotions/promotions.md`, § 2.14).
 * Un point qui n'est pas (ou pas encore) dans la liste servie n'est pas dit :
 * une mention sans lieu promettrait la remise partout. Une sélection de zones
 * ne se dit pas non plus : « en livraison » la promettrait à toute adresse, et
 * le rayon ne connaît pas encore l'adresse du client (2026-10-31) — on annonce
 * moins que la caisse, jamais plus.
 */
export function fulfillmentOfferLabels(
  offer: ShopItemFulfillmentOfferView,
  product: ClientCopy['product'],
  pickupLabel: (id: string) => string | null,
  locale = 'fr',
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
  if (delivery === 'all') {
    labels.push(fill(product.offerOnDelivery, { discount }));
  }
  return labels.map((label) => withHours(label, offer.hours, product, locale));
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
  private readonly locale = inject(ClientLocale);

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
    const locale = this.locale.current();
    return offers.flatMap((offer) =>
      fulfillmentOfferLabels(offer, product, (id) => labels.get(id) ?? null, locale),
    );
  }
}
