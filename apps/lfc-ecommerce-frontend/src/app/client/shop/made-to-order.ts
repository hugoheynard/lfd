import type { ShopItemOrderLimit } from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import { formatHour } from '../format-hour';

/** Les trois formes de la phrase, telles que le dictionnaire les écrit. */
export interface MadeToOrderForms {
  readonly madeToOrderDays: string;
  readonly madeToOrderEve: string;
  readonly madeToOrderSameDay: string;
}

/**
 * **« Préparé sur commande — à commander 2 jours à l'avance, avant 12 h »**
 * (Hugo, 2026-10-21) — la limite propre d'un article, sur sa fiche et sur sa
 * ligne du panier.
 *
 * Le serveur ne la sert que quand elle est plus stricte que la règle générale
 * (`shownItemOrderLimit`) : son absence EST la réponse, et rien ne s'affiche.
 * La grâce n'est jamais dite.
 */
export function madeToOrderLabel(
  limit: ShopItemOrderLimit | undefined,
  locale: LocaleCode,
  forms: MadeToOrderForms,
): string | null {
  if (limit === undefined) {
    return null;
  }
  const time = clockLabel(limit.time, locale);
  if (limit.daysBefore === 0) {
    return fill(forms.madeToOrderSameDay, { time });
  }
  return limit.daysBefore === 1
    ? fill(forms.madeToOrderEve, { time })
    : fill(forms.madeToOrderDays, { n: String(limit.daysBefore), time });
}

/**
 * Une heure de pendule `HH:MM` : « 12 h » en français (écriture de la
 * boutique, cf. `formatHour`), la forme de la langue ailleurs — mise en forme
 * en UTC, pour qu'aucun fuseau ne la décale.
 */
function clockLabel(time: string, locale: LocaleCode): string {
  if (locale === 'fr') {
    return formatHour(time);
  }
  const instant = new Date(`1970-01-01T${time}:00.000Z`);
  return Number.isNaN(instant.getTime())
    ? time
    : new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      }).format(instant);
}
