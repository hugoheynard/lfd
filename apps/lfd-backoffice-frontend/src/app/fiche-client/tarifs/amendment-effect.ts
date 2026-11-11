import { businessDayStart } from '../../shared/business-day';
import { parisToday } from '../../shared/paris-today';
import type { AmendmentDiff } from './amendment-diff';

/**
 * **La date d'effet d'un avenant** (`documentation/pricing/mercuriales/l-avenant-date.md`) :
 * le jour proposé par défaut, « maintenant » sans `validFrom`, les refus de
 * date, et F1 — la fin qu'un avenant ne peut porter que s'il n'arrête rien. Pur.
 */

/** La phrase de F1 : ce qui ne revient pas de soi-même à la fin d'un avenant. */
export const NO_END_REASON =
  'Un prix changé ou retiré, et les promotions, ne reviennent pas d’eux-mêmes à une date : faites un second avenant à cette date.';

/**
 * **F1** : une fin n'est proposée que si l'avenant n'arrête aucun prix et ne
 * touche pas aux promotions — ni l'un ni l'autre ne revient à sa fin.
 */
export function endAllowed(diff: AmendmentDiff): boolean {
  return diff.endedSkus.length === 0 && diff.promotionPolicy === null;
}

/**
 * `validFrom` : **absent** pour « maintenant » — aujourd'hui compris, dont le
 * minuit est déjà passé et serait refusé comme rétroactif.
 */
export function effectFrom(fromDay: string, today: string): { validFrom?: string } {
  const from = fromDay === '' || fromDay === today ? null : businessDayStart(fromDay);
  return from === null ? {} : { validFrom: from };
}

/** Ce que la date d'effet et la fin disent, en `AAAA-MM-JJ`. */
export interface AmendmentWindow {
  /** Vide ou aujourd'hui = maintenant. */
  readonly fromDay: string;
  /** Vide = jusqu'à la fin de la mercuriale. */
  readonly toDay: string;
  /** Aujourd'hui à Paris. */
  readonly today: string;
}

/** Le refus de la date, ou `null`. */
export function datingProblem(diff: AmendmentDiff, dating: AmendmentWindow): string | null {
  const from = dating.fromDay === '' ? dating.today : dating.fromDay;
  if (from < dating.today) {
    return 'La date d’effet ne peut pas être passée : un avenant n’est jamais rétroactif.';
  }
  if (dating.toDay !== '' && !endAllowed(diff)) {
    return NO_END_REASON;
  }
  if (dating.toDay !== '' && dating.toDay <= from) {
    return 'La fin doit venir après la date d’effet.';
  }
  return null;
}

/**
 * **La date d'effet par défaut** : le plus tard entre aujourd'hui et le
 * premier jour de la mercuriale. Une mercuriale qui n'a pas commencé ne
 * s'amende pas avant son début — « maintenant » y serait refusé.
 */
export function defaultEffectDay(mercurialeValidFrom: string, today: string): string {
  const start = parisToday(new Date(mercurialeValidFrom));
  return start > today ? start : today;
}
