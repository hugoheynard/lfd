import { RecapMonth } from "../value-objects/recap-month.js";

/** Une période « maison » d'un payeur : `withdrawnAt` nul, elle court encore. */
export interface InHousePeriod {
  readonly declaredAt: Date;
  readonly withdrawnAt: Date | null;
}

/**
 * **Les mois manqués** d'un payeur (`restaurants-maison.md`) : les
 * mois clos où il a été maison au moins un instant et qui n'ont aucune issue
 * — ni récapitulatif, ni mois vide. Un mois vide n'est pas manqué : le
 * passage l'a vu et n'avait rien à récapituler. Du plus ancien au plus récent.
 */
export function missedMonths(
  periods: readonly InHousePeriod[],
  attempted: ReadonlySet<string>,
  lastClosed: RecapMonth,
): readonly string[] {
  const due = new Set<string>();
  for (const period of periods) {
    for (const month of monthsOf(period, lastClosed)) {
      due.add(month.key);
    }
  }
  return [...due].filter((key) => !attempted.has(key)).sort();
}

/** Les mois clos touchés par une période, jusqu'à `lastClosed` compris. */
function monthsOf(period: InHousePeriod, lastClosed: RecapMonth): readonly RecapMonth[] {
  const months: RecapMonth[] = [];
  // La période est `[declaredAt, withdrawnAt[` : son dernier instant précède le retrait.
  const last =
    period.withdrawnAt === null
      ? lastClosed
      : RecapMonth.containing(new Date(period.withdrawnAt.getTime() - 1));
  const end = last.isBefore(lastClosed) ? last : lastClosed;
  for (
    let month = RecapMonth.containing(period.declaredAt);
    !end.isBefore(month);
    month = month.next()
  ) {
    months.push(month);
  }
  return months;
}
