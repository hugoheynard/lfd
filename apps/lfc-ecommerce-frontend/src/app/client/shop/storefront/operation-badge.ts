import { instantToLocal, type PublicStorefrontOperationView } from '@lfd/contracts';

import type { LocaleCode } from '../../client-locale.service';
import type { ClientCopy } from '../../copy/client-copy.model';
import { fill } from '../../copy/client-copy.service';
import { shortDate } from '../operations';

const DAY_MS = 86_400_000;

/** Midi UTC : un jour `AAAA-MM-JJ` reste le même jour, et l'écart entre deux jours un entier. */
function middayOf(day: string): number {
  return Date.parse(`${day}T12:00:00.000Z`);
}

/**
 * Les jours CALENDAIRES de Paris entre maintenant et la clôture : 0 le jour
 * même, quelle que soit l'heure. Les deux instants sont d'abord ramenés à leur
 * jour de Paris — un écart d'instants divisé par 24 h dirait « J‑0 » la veille
 * au soir d'une clôture à midi.
 */
export function daysUntil(orderUntil: string, now: Date): number | null {
  const until = new Date(orderUntil);
  if (Number.isNaN(until.getTime())) {
    return null;
  }
  const gap = middayOf(instantToLocal(until).day) - middayOf(instantToLocal(now).day);
  return Math.max(Math.round(gap / DAY_MS), 0);
}

/**
 * **La pastille qu'une annonce d'opération se calcule** (D11 de
 * `documentation/order/architecture-operations-datees.md`), quand la vitrine
 * n'en a saisi aucune : « Dès le 15 nov. » (annoncée), « J‑18 » (ouverte),
 * « Dernier jour » (ouverte, le jour de la clôture), « Commandes closes ».
 *
 * `now` en paramètre : le libellé se lit à l'heure du navigateur — c'est un
 * LIBELLÉ, pas une décision de vente, et le serveur a déjà dit l'état.
 */
export function operationBadge(
  operation: PublicStorefrontOperationView,
  now: Date,
  locale: LocaleCode,
  copy: ClientCopy,
): string | null {
  switch (operation.state) {
    case 'announced':
      return fill(copy.shop.operationBadgeFrom, { date: shortDate(operation.orderFrom, locale) });
    case 'closed':
      return copy.shop.operationClosed;
    case 'open': {
      const days = daysUntil(operation.orderUntil, now);
      if (days === null) {
        return null;
      }
      return days === 0
        ? copy.shop.operationBadgeLastDay
        : fill(copy.shop.operationBadgeDays, { days: String(days) });
    }
  }
}
