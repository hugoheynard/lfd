import { instantToLocal } from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';
import { formatHour } from '../format-hour';
import { SHOP_TIME_ZONE } from '../shop-time-zone';

const MINUTES_PER_HOUR = 60;

/** Les trois formes d'une durée restante, telles que le dictionnaire les écrit. */
export interface LeftForms {
  readonly cutoffLeftHoursMinutes: string;
  readonly cutoffLeftHours: string;
  readonly cutoffLeftMinutes: string;
}

/**
 * « 2 h 15 », « 3 h », « 12 min » — les minutes seulement quand il y en a,
 * l'heure seulement au-delà de soixante minutes.
 */
export function leftLabel(minutesLeft: number, forms: LeftForms): string {
  const hours = Math.floor(minutesLeft / MINUTES_PER_HOUR);
  const minutes = minutesLeft % MINUTES_PER_HOUR;
  if (hours === 0) {
    return forms.cutoffLeftMinutes.replaceAll('{m}', String(minutes));
  }
  const template = minutes === 0 ? forms.cutoffLeftHours : forms.cutoffLeftHoursMinutes;
  return template
    .replaceAll('{h}', String(hours))
    .replaceAll('{mm}', String(minutes).padStart(2, '0'));
}

/**
 * L'heure d'un instant, lue à Paris : « 23 h » en français (écriture de la
 * boutique, cf. `formatHour`), la forme de la langue ailleurs.
 */
export function limitHourLabel(instant: Date, locale: LocaleCode): string {
  if (locale === 'fr') {
    return formatHour(instantToLocal(instant).time);
  }
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SHOP_TIME_ZONE,
  }).format(instant);
}

/**
 * « jeudi » — le jour de la semaine seul, comme Hugo le dit : « plus que …
 * pour commander pour le jeudi ». Mis en forme à midi UTC : aucun fuseau ne
 * peut le faire changer de jour.
 */
export function weekdayLabel(day: string, locale: LocaleCode): string {
  const instant = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) {
    return day;
  }
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(instant);
}
