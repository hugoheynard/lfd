import type { MonthlyClosureView } from '@lfd/contracts';

import { sameClosure } from '../collection-month-wording';

/** Une clôture du mois, et si c'est celle du lot à préparer. */
export interface OrderedClosure {
  readonly closure: MonthlyClosureView;
  readonly toPrepare: boolean;
}

/**
 * Les clôtures du mois (M4c) : celle du lot à préparer en tête, puis les
 * autres dans l'ordre du calendrier. Sans clôture à préparer connue, l'ordre
 * reste celui du serveur.
 */
export function closuresInOrder(
  all: readonly MonthlyClosureView[],
  toPrepareClosesAt: string | null,
): readonly OrderedClosure[] {
  const isToPrepare = (closesAt: string): boolean =>
    toPrepareClosesAt !== null && sameClosure(closesAt, toPrepareClosesAt);
  return [
    ...all.filter((closure) => isToPrepare(closure.periodClosesAt)),
    ...all.filter((closure) => !isToPrepare(closure.periodClosesAt)),
  ].map((closure) => ({ closure, toPrepare: isToPrepare(closure.periodClosesAt) }));
}
