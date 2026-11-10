import { businessDaysAfter, isTarget2BusinessDay } from "./target2-calendar.js";

/**
 * **La règle de lecture des attestations « Retours contrôlés »** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2) : aucune ligne ne s'efface,
 * une attestation fausse se retire par une ligne de plus, et **la dernière
 * ligne d'un jour fait foi**. Pur : ni lecture, ni horloge.
 */

/** Une ligne du registre, telle que la règle la lit. */
export interface BankReturnCheckLine {
  readonly id: string;
  /** `AAAA-MM-JJ`, jour de Paris. */
  readonly day: string;
  readonly at: Date;
  readonly staffId: string;
  readonly withdrawn: boolean;
}

/** La plus récente d'abord : l'instant, puis l'identifiant (ULID, triable). */
function laterFirst(left: BankReturnCheckLine, right: BankReturnCheckLine): number {
  const byTime = right.at.getTime() - left.at.getTime();
  return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
}

/** La ligne qui fait foi pour un jour : la dernière, si elle n'est pas un retrait. */
export function standingCheckOf<T extends BankReturnCheckLine>(lines: readonly T[]): T | null {
  const [latest] = [...lines].sort(laterFirst);
  return latest === undefined || latest.withdrawn ? null : latest;
}

/** Les jours attestés, chaque jour lu par sa dernière ligne. */
export function checkedDaysOf(lines: readonly BankReturnCheckLine[]): ReadonlySet<string> {
  const byDay = new Map<string, BankReturnCheckLine[]>();
  for (const line of lines) {
    byDay.set(line.day, [...(byDay.get(line.day) ?? []), line]);
  }
  return new Set(
    [...byDay.entries()].filter(([, ofDay]) => standingCheckOf(ofDay) !== null).map(([d]) => d),
  );
}

/**
 * Les jours ouvrés de la fenêtre de suivi [échéance, fin] qui sont déjà
 * arrivés (≤ `today`) et qu'aucune attestation ne couvre — ceux que l'onglet
 * 4 nomme : un trou ne se lisse pas en « fait » (§ 3.4).
 */
export function missingCheckDays(
  collectionDay: string,
  watchUntilDay: string,
  today: string,
  checked: ReadonlySet<string>,
): readonly string[] {
  const last = today < watchUntilDay ? today : watchUntilDay;
  const missing: string[] = [];
  let day = isTarget2BusinessDay(collectionDay)
    ? collectionDay
    : businessDaysAfter(collectionDay, 1);
  while (day <= last) {
    if (!checked.has(day)) {
      missing.push(day);
    }
    day = businessDaysAfter(day, 1);
  }
  return missing;
}
