import { inject, Injectable } from '@angular/core';

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
 * **La mention d'UNE offre** — le texte réglé sur la promotion, servi dans la
 * langue du rayon, sinon la valeur seule (« −20 % »), et ses heures quand
 * elle n'agit pas maintenant (`documentation/promotions/plan-texte-de-la-vignette.md`).
 * Plus d'acheminement : le serveur a déjà jugé qu'un acheminement ouvert au
 * lecteur l'applique, et la caisse le chiffre une fois l'acheminement choisi.
 */
export function offerMentionLabel(
  offer: ShopItemFulfillmentOfferView,
  product: ClientCopy['product'],
  locale = 'fr',
): string {
  const label = offer.text ?? offerDiscountLabel(offer.effect, product);
  return withHours(label, offer.hours, product, locale);
}

/**
 * **Les mentions d'un article**, sous le prix de la vignette et de la fiche
 * (plan des promotions, § 13.2 RAYON, lot L10). Le prix du rayon ne les
 * compte pas : l'acheminement n'y est pas encore choisi, et le panier les
 * applique dès qu'il l'est. Deux offres qui se disent pareil ne se disent
 * qu'une fois.
 */
@Injectable({ providedIn: 'root' })
export class FulfillmentOfferLabels {
  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);

  /** À lire dans un `computed` : suit la langue. */
  of(item: ShopItemView): readonly string[] {
    const offers = item.fulfillmentOffers ?? [];
    if (offers.length === 0) {
      return [];
    }
    const product = this.t().product;
    const locale = this.locale.current();
    return [...new Set(offers.map((offer) => offerMentionLabel(offer, product, locale)))];
  }
}
